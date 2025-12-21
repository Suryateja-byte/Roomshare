import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            emailVerified: Date | null;
            isAdmin: boolean;
            isSuspended: boolean;
        } & DefaultSession['user'];
    }

    interface User extends DefaultUser {
        id: string;
        emailVerified: Date | null;
        isAdmin: boolean;
        isSuspended: boolean;
    }
}

declare module 'next-auth/jwt' {
    interface JWT extends DefaultJWT {
        emailVerified?: Date | null;
        isAdmin?: boolean;
        isSuspended?: boolean;
        image?: string | null;
    }
}
