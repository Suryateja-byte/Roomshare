import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClient } from '@supabase/supabase-js';
import { withRateLimit } from '@/lib/with-rate-limit';

// Initialize Supabase client with service role for storage operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Magic bytes signatures for image validation
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
    'image/jpeg': [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
    'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] }],
    'image/gif': [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8
    'image/webp': [
        { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
        { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
    ],
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
    const signatures = MAGIC_BYTES[mimeType];
    if (!signatures) return false;

    for (const sig of signatures) {
        if (buffer.length < sig.offset + sig.bytes.length) return false;
        for (let i = 0; i < sig.bytes.length; i++) {
            if (buffer[sig.offset + i] !== sig.bytes[i]) return false;
        }
    }
    return true;
}

// Safe extension mapping from validated MIME type
const MIME_TO_EXTENSION: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
    // P1-6 FIX: Add rate limiting to prevent storage abuse
    const rateLimitResponse = await withRateLimit(request, { type: 'upload' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Check authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check Supabase configuration
        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase config:', {
                hasUrl: !!supabaseUrl,
                hasKey: !!supabaseServiceKey
            });
            return NextResponse.json(
                { error: 'Storage not configured. Please check your Supabase environment variables.' },
                { status: 500 }
            );
        }

        // Create Supabase client with explicit fetch options for better error handling
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });

        // Get form data
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const type = formData.get('type') as string; // 'profile' or 'listing'

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file size first (max 5MB) - check before reading buffer
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            return NextResponse.json(
                { error: 'File too large. Maximum size is 5MB' },
                { status: 400 }
            );
        }

        // Validate declared MIME type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
                { status: 400 }
            );
        }

        // Convert file to buffer for magic bytes validation
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate magic bytes to prevent MIME type spoofing
        if (!validateMagicBytes(buffer, file.type)) {
            return NextResponse.json(
                { error: 'File content does not match declared type. Upload rejected.' },
                { status: 400 }
            );
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const extension = MIME_TO_EXTENSION[file.type];
        const filename = `${timestamp}-${randomString}.${extension}`;

        // Determine storage path based on type
        const bucket = 'images';
        const folder = type === 'profile' ? 'profiles' : 'listings';
        const path = `${folder}/${session.user.id}/${filename}`;

        // Upload to Supabase Storage
        const { data, error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(path, buffer, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) {
            console.error('Supabase upload error:', {
                message: uploadError.message,
                name: uploadError.name,
                bucket,
                path
            });

            // Provide more specific error messages
            if (uploadError.message.includes('Bucket not found')) {
                return NextResponse.json(
                    { error: 'Storage bucket not configured. Please create an "images" bucket in Supabase.' },
                    { status: 500 }
                );
            }

            return NextResponse.json(
                { error: 'Failed to upload file: ' + uploadError.message },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);

        return NextResponse.json({
            url: urlData.publicUrl,
            path: path
        });
    } catch (error) {
        console.error('Upload error:', error);

        // Handle specific error types
        if (error instanceof TypeError && error.message.includes('fetch')) {
            return NextResponse.json(
                { error: 'Network error: Unable to connect to storage service. Please check your internet connection and Supabase configuration.' },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
            { status: 500 }
        );
    }
}

// Delete uploaded image
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json(
                { error: 'Storage not configured' },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { path } = await request.json();

        if (!path) {
            return NextResponse.json({ error: 'No path provided' }, { status: 400 });
        }

        // P0-01 FIX: Strict prefix validation to prevent path traversal attacks
        // Before: path.includes() was bypassable with "../" sequences
        // After: Strict startsWith() with expected prefix structure
        const folder = path.startsWith('profiles/') ? 'profiles' : 'listings';
        const expectedPrefix = `${folder}/${session.user.id}/`;
        if (!path.startsWith(expectedPrefix)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { error: deleteError } = await supabase.storage
            .from('images')
            .remove([path]);

        if (deleteError) {
            console.error('Delete error:', deleteError);
            return NextResponse.json(
                { error: 'Failed to delete file' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
