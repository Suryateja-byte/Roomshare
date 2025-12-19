import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            emailVerified: Date | null;
            isAdmin: boolean;
        } & DefaultSession['user'];
    }

    interface User extends DefaultUser {
        id: string;
        emailVerified: Date | null;
        isAdmin: boolean;
    }
}

declare module 'next-auth/jwt' {
    interface JWT extends DefaultJWT {
        emailVerified?: Date | null;
        isAdmin?: boolean;
        image?: string | null;
    }
}
