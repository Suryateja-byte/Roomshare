# 07 State Management

| State area | Owner | Current behavior | Evidence |
| --- | --- | --- | --- |
| Session token | Auth.js callbacks | JWT stores selected user state, image/name, isAdmin/isSuspended/emailVerified, authTime, and passwordInvalidated marker. | APS-E001 |
| Protected route state | Auth helper | Live suspension cache stores suspension state briefly and password revocation is checked on protected requests. | APS-E003 |
| Login client | Login form | Tracks loading, Google loading, error, hydration, password visibility, Turnstile token/error, and existing session. | APS-E004 |
| Signup client | Signup form | Tracks loading, Google loading, password/confirm, terms, visibility, Turnstile token/error, and validation errors. | APS-E005 |
| Profile edit | Edit profile client | Tracks profile form fields, upload state, error/success, language input, image URL, and persisted draft. | APS-E011 |
| Saved listings | Saved listings client | Tracks listing collection, removing ID, sort option, and image errors. | APS-E012 |
| Favorites API | Database plus response | Stores saved state in `SavedListing`, returns private no-store API responses. | APS-E013, APS-E016 |
| Saved searches | SavedSearchList plus actions | Tracks searches, alert paywall summary, loading ID, checkout phase/notice, checkout params, and DB saved-search/alert-subscription state. | APS-E014, APS-E016 |
| Settings | Settings client plus actions | Tracks preferences, save state, blocked users/unblock state, password form state, delete confirmation/modal/deleting state; actions persist preferences/password/delete effects. | APS-E015 |
