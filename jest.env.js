// Jest environment setup - runs BEFORE test framework is installed
// This ensures environment variables are set before any module imports

// Database URL for Prisma (prevents PrismaClientConstructorValidationError)
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

// Supabase config for storage tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
