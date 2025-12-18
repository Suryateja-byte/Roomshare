import { renderHook, act, waitFor } from '@testing-library/react';
import { useAbortableServerAction } from '@/hooks/useAbortableServerAction';

describe('useAbortableServerAction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should execute action and update data on success', async () => {
        const mockAction = jest.fn().mockResolvedValue({ id: '1', name: 'test' });
        const onSuccess = jest.fn();

        const { result } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
                onSuccess,
            })
        );

        expect(result.current.isLoading).toBe(false);
        expect(result.current.data).toBeNull();

        await act(async () => {
            await result.current.execute({ param: 'value' });
        });

        expect(mockAction).toHaveBeenCalledWith({ param: 'value' });
        expect(result.current.data).toEqual({ id: '1', name: 'test' });
        expect(result.current.isLoading).toBe(false);
        expect(onSuccess).toHaveBeenCalledWith({ id: '1', name: 'test' });
    });

    it('should track loading state correctly', async () => {
        let resolveAction: (value: string) => void;
        const mockAction = jest.fn().mockImplementation(
            () => new Promise<string>((resolve) => {
                resolveAction = resolve;
            })
        );

        const { result } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
            })
        );

        expect(result.current.isLoading).toBe(false);

        // Start the action
        act(() => {
            result.current.execute({ test: true });
        });

        // Should be loading now
        await waitFor(() => expect(result.current.isLoading).toBe(true));

        // Resolve the promise
        await act(async () => {
            resolveAction!('result');
        });

        // Should no longer be loading
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toBe('result');
    });

    it('should ignore stale responses when rapid requests are made', async () => {
        const resolvers: ((value: string) => void)[] = [];
        const mockAction = jest.fn().mockImplementation(
            () => new Promise<string>((resolve) => {
                resolvers.push(resolve);
            })
        );

        const onSuccess = jest.fn();
        const { result } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
                onSuccess,
            })
        );

        // Make two rapid requests
        act(() => {
            result.current.execute({ request: 1 });
        });
        act(() => {
            result.current.execute({ request: 2 });
        });

        expect(mockAction).toHaveBeenCalledTimes(2);

        // Resolve second request first (the "fresh" one)
        await act(async () => {
            resolvers[1]('result2');
        });

        await waitFor(() => expect(result.current.data).toBe('result2'));
        expect(onSuccess).toHaveBeenCalledWith('result2');

        // Now resolve first request (the "stale" one) - should be ignored
        await act(async () => {
            resolvers[0]('result1');
        });

        // Data should still be result2, not result1
        expect(result.current.data).toBe('result2');
        // onSuccess should only have been called once with result2
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
        const mockError = new Error('Network error');
        const mockAction = jest.fn().mockRejectedValue(mockError);
        const onError = jest.fn();

        const { result } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
                onError,
            })
        );

        await act(async () => {
            await result.current.execute({ test: true });
        });

        expect(result.current.error).toBe(mockError);
        expect(result.current.isLoading).toBe(false);
        expect(onError).toHaveBeenCalledWith(mockError);
    });

    it('should ignore errors from stale requests', async () => {
        const resolvers: { resolve: (v: string) => void; reject: (e: Error) => void }[] = [];
        const mockAction = jest.fn().mockImplementation(
            () => new Promise<string>((resolve, reject) => {
                resolvers.push({ resolve, reject });
            })
        );

        const onError = jest.fn();
        const onSuccess = jest.fn();
        const { result } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
                onError,
                onSuccess,
            })
        );

        // Make two rapid requests
        act(() => {
            result.current.execute({ request: 1 });
        });
        act(() => {
            result.current.execute({ request: 2 });
        });

        // Resolve second request successfully
        await act(async () => {
            resolvers[1].resolve('success');
        });

        await waitFor(() => expect(result.current.data).toBe('success'));

        // First request errors (stale) - should be ignored
        await act(async () => {
            resolvers[0].reject(new Error('Stale error'));
        });

        // Error should not be set since it's from a stale request
        expect(result.current.error).toBeNull();
        expect(onError).not.toHaveBeenCalled();
    });

    it('should cancel pending requests', async () => {
        let resolveAction: (value: string) => void;
        const mockAction = jest.fn().mockImplementation(
            () => new Promise<string>((resolve) => {
                resolveAction = resolve;
            })
        );

        const onSuccess = jest.fn();
        const { result } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
                onSuccess,
            })
        );

        // Start a request
        act(() => {
            result.current.execute({ test: true });
        });

        await waitFor(() => expect(result.current.isLoading).toBe(true));

        // Cancel the request
        act(() => {
            result.current.cancel();
        });

        expect(result.current.isLoading).toBe(false);

        // Now resolve the cancelled request - should be ignored
        await act(async () => {
            resolveAction!('cancelled result');
        });

        // Data should still be null since request was cancelled
        expect(result.current.data).toBeNull();
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('should clear error on new request', async () => {
        const mockError = new Error('First error');
        const mockAction = jest.fn()
            .mockRejectedValueOnce(mockError)
            .mockResolvedValueOnce('success');

        const { result } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
            })
        );

        // First request fails
        await act(async () => {
            await result.current.execute({ attempt: 1 });
        });

        expect(result.current.error).toBe(mockError);

        // Second request - error should be cleared during request
        await act(async () => {
            await result.current.execute({ attempt: 2 });
        });

        expect(result.current.error).toBeNull();
        expect(result.current.data).toBe('success');
    });

    it('should handle non-Error objects in catch', async () => {
        const mockAction = jest.fn().mockRejectedValue('string error');
        const onError = jest.fn();

        const { result } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
                onError,
            })
        );

        await act(async () => {
            await result.current.execute({});
        });

        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error?.message).toBe('Unknown error');
        expect(onError).toHaveBeenCalled();
    });

    it('should prevent state updates after unmount', async () => {
        let resolveAction: (value: string) => void;
        const mockAction = jest.fn().mockImplementation(
            () => new Promise<string>((resolve) => {
                resolveAction = resolve;
            })
        );

        const onSuccess = jest.fn();
        const { result, unmount } = renderHook(() =>
            useAbortableServerAction({
                action: mockAction,
                onSuccess,
            })
        );

        // Start a request
        act(() => {
            result.current.execute({ test: true });
        });

        // Unmount the component
        unmount();

        // Resolve the action after unmount
        await act(async () => {
            resolveAction!('after unmount');
        });

        // onSuccess should not be called since component unmounted
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('should work with different parameter and result types', async () => {
        interface SearchParams {
            ne_lat: number;
            ne_lng: number;
            sw_lat: number;
            sw_lng: number;
        }

        interface Listing {
            id: string;
            title: string;
            price: number;
        }

        const mockAction = jest.fn<Promise<Listing[]>, [SearchParams]>()
            .mockResolvedValue([
                { id: '1', title: 'Room 1', price: 1000 },
                { id: '2', title: 'Room 2', price: 1500 },
            ]);

        const { result } = renderHook(() =>
            useAbortableServerAction<SearchParams, Listing[]>({
                action: mockAction,
            })
        );

        await act(async () => {
            await result.current.execute({
                ne_lat: 37.8,
                ne_lng: -122.3,
                sw_lat: 37.7,
                sw_lng: -122.5,
            });
        });

        expect(result.current.data).toHaveLength(2);
        expect(result.current.data?.[0].title).toBe('Room 1');
    });
});
