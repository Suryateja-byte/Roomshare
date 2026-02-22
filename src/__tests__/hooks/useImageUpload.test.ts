import { renderHook, act } from '@testing-library/react';
import { useImageUpload } from '@/hooks/useImageUpload';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function createFile(name: string, size: number, type: string): File {
    const buffer = new ArrayBuffer(size);
    return new File([buffer], name, { type });
}

describe('useImageUpload', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('validateFile', () => {
        it('returns null for a valid image file', () => {
            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            const file = createFile('photo.jpg', 1024 * 1024, 'image/jpeg');
            expect(result.current.validateFile(file)).toBeNull();
        });

        it('rejects files with invalid type', () => {
            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            const file = createFile('doc.pdf', 1024, 'application/pdf');
            const error = result.current.validateFile(file);
            expect(error).toContain('File type not accepted');
            expect(error).toContain('JPEG');
        });

        it('rejects files exceeding max size', () => {
            const { result } = renderHook(() =>
                useImageUpload({
                    uploadType: 'listing',
                    maxSizeBytes: 2 * 1024 * 1024, // 2MB
                })
            );

            const file = createFile('big.jpg', 3 * 1024 * 1024, 'image/jpeg'); // 3MB
            const error = result.current.validateFile(file);
            expect(error).toContain('File too large');
            expect(error).toContain('2MB');
        });

        it('accepts files at exactly max size', () => {
            const maxSize = 5 * 1024 * 1024;
            const { result } = renderHook(() =>
                useImageUpload({
                    uploadType: 'listing',
                    maxSizeBytes: maxSize,
                })
            );

            const file = createFile('exact.png', maxSize, 'image/png');
            expect(result.current.validateFile(file)).toBeNull();
        });

        it('accepts all default image types', () => {
            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            const types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            for (const type of types) {
                const file = createFile('test', 1024, type);
                expect(result.current.validateFile(file)).toBeNull();
            }
        });

        it('respects custom accepted types', () => {
            const { result } = renderHook(() =>
                useImageUpload({
                    uploadType: 'listing',
                    acceptedTypes: ['image/png'],
                })
            );

            const pngFile = createFile('ok.png', 1024, 'image/png');
            expect(result.current.validateFile(pngFile)).toBeNull();

            const jpgFile = createFile('no.jpg', 1024, 'image/jpeg');
            expect(result.current.validateFile(jpgFile)).toContain('File type not accepted');
        });
    });

    describe('uploadImage', () => {
        it('uploads a valid file and returns the URL', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ url: 'https://cdn.example.com/photo.jpg' }),
            });

            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'profile' })
            );

            let url: string;
            await act(async () => {
                url = await result.current.uploadImage(
                    createFile('photo.jpg', 1024, 'image/jpeg')
                );
            });

            expect(url!).toBe('https://cdn.example.com/photo.jpg');
            expect(mockFetch).toHaveBeenCalledWith('/api/upload', {
                method: 'POST',
                body: expect.any(FormData),
            });

            // Verify FormData contents
            const formData = mockFetch.mock.calls[0][1].body as FormData;
            expect(formData.get('type')).toBe('profile');
            expect(formData.get('file')).toBeTruthy();
        });

        it('sets isUploading during upload', async () => {
            let resolveUpload: (value: Response) => void;
            mockFetch.mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveUpload = resolve;
                    })
            );

            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            expect(result.current.isUploading).toBe(false);

            // Start upload (don't await)
            let uploadPromise: Promise<string>;
            act(() => {
                uploadPromise = result.current.uploadImage(
                    createFile('photo.jpg', 1024, 'image/jpeg')
                );
            });

            expect(result.current.isUploading).toBe(true);

            // Complete the upload
            await act(async () => {
                resolveUpload!({
                    ok: true,
                    json: () => Promise.resolve({ url: 'https://cdn.example.com/photo.jpg' }),
                } as unknown as Response);
                await uploadPromise;
            });

            expect(result.current.isUploading).toBe(false);
        });

        it('handles server error responses', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'File too large for server' }),
            });

            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            let thrownError: Error | undefined;
            await act(async () => {
                try {
                    await result.current.uploadImage(
                        createFile('photo.jpg', 1024, 'image/jpeg')
                    );
                } catch (err) {
                    thrownError = err as Error;
                }
            });

            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toBe('File too large for server');
            expect(result.current.error).toBe('File too large for server');
            expect(result.current.isUploading).toBe(false);
        });

        it('handles network errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            let thrownError: Error | undefined;
            await act(async () => {
                try {
                    await result.current.uploadImage(
                        createFile('photo.jpg', 1024, 'image/jpeg')
                    );
                } catch (err) {
                    thrownError = err as Error;
                }
            });

            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toBe('Network error');
            expect(result.current.error).toBe('Network error');
            expect(result.current.isUploading).toBe(false);
        });

        it('rejects invalid files without calling fetch', async () => {
            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            let thrownError: Error | undefined;
            await act(async () => {
                try {
                    await result.current.uploadImage(
                        createFile('doc.pdf', 1024, 'application/pdf')
                    );
                } catch (err) {
                    thrownError = err as Error;
                }
            });

            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain('File type not accepted');
            expect(mockFetch).not.toHaveBeenCalled();
            expect(result.current.error).toContain('File type not accepted');
        });

        it('uses generic error message for non-Error throws', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({}), // no error field
            });

            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            let thrownError: Error | undefined;
            await act(async () => {
                try {
                    await result.current.uploadImage(
                        createFile('photo.jpg', 1024, 'image/jpeg')
                    );
                } catch (err) {
                    thrownError = err as Error;
                }
            });

            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toBe('Upload failed');
            expect(result.current.error).toBe('Upload failed');
        });
    });

    describe('clearError', () => {
        it('clears the error state', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            // Trigger an error
            await act(async () => {
                try {
                    await result.current.uploadImage(
                        createFile('photo.jpg', 1024, 'image/jpeg')
                    );
                } catch {
                    // expected
                }
            });

            expect(result.current.error).toBe('Network error');

            act(() => {
                result.current.clearError();
            });

            expect(result.current.error).toBeNull();
        });
    });

    describe('concurrent uploads', () => {
        it('keeps isUploading true until all uploads complete', async () => {
            let resolveFirst: (value: Response) => void;
            let resolveSecond: (value: Response) => void;

            mockFetch
                .mockImplementationOnce(
                    () => new Promise<Response>((resolve) => { resolveFirst = resolve; })
                )
                .mockImplementationOnce(
                    () => new Promise<Response>((resolve) => { resolveSecond = resolve; })
                );

            const { result } = renderHook(() =>
                useImageUpload({ uploadType: 'listing' })
            );

            let promise1: Promise<string>;
            let promise2: Promise<string>;

            act(() => {
                promise1 = result.current.uploadImage(createFile('a.jpg', 1024, 'image/jpeg'));
                promise2 = result.current.uploadImage(createFile('b.jpg', 1024, 'image/jpeg'));
            });

            expect(result.current.isUploading).toBe(true);

            // Complete first upload
            await act(async () => {
                resolveFirst!({
                    ok: true,
                    json: () => Promise.resolve({ url: 'https://cdn.example.com/a.jpg' }),
                } as unknown as Response);
                await promise1!;
            });

            // Still uploading because second hasn't finished
            expect(result.current.isUploading).toBe(true);

            // Complete second upload
            await act(async () => {
                resolveSecond!({
                    ok: true,
                    json: () => Promise.resolve({ url: 'https://cdn.example.com/b.jpg' }),
                } as unknown as Response);
                await promise2!;
            });

            expect(result.current.isUploading).toBe(false);
        });
    });
});
