"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Loader2, MapPin, SearchX, WifiOff, X } from "lucide-react";
import { useDebounce } from "use-debounce";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type {
  AddressAutocompleteSuccessResponse,
  AddressAutocompleteSuggestion,
} from "@/lib/geocoding/address-autocomplete";
import {
  appendTypedAddressUnit,
  buildAddressAutocompleteProviderQuery,
  dedupeAddressSuggestions,
  formatParsedAddressForSelection,
  getAddressSuggestionRenderKey,
  normalizeUsState,
  parseAddressInput,
  type AddressSearchContext,
} from "@/lib/geocoding/address-suggestion-utils";

const ADDRESS_AUTOCOMPLETE_MIN_QUERY_LENGTH = 4;
const ADDRESS_AUTOCOMPLETE_LIMIT = 5;
const ADDRESS_AUTOCOMPLETE_TIMEOUT_MS = 9000;
const ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS = 350;

export interface AddressAutocompleteSelection {
  address: string;
  city: string;
  state: string;
  zip: string;
  precision?: AddressAutocompleteSuggestion["precision"];
  addressSuggestionToken?: string;
}

interface ManualAddressOption {
  kind: "manual";
  key: string;
  primaryText: string;
  secondaryText: string;
  selection: AddressAutocompleteSelection;
}

interface ProviderAddressOption {
  kind: "suggestion";
  suggestion: AddressAutocompleteSuggestion;
}

type AddressAutocompleteOption = ManualAddressOption | ProviderAddressOption;

interface AddressDetailsSuccessResponse {
  suggestion?: AddressAutocompleteSuggestion;
  verificationStatus?: "trusted";
}

interface AddressAutocompleteInputProps {
  id: string;
  name: string;
  value: string;
  city?: string;
  state?: string;
  zip?: string;
  onChange: (value: string) => void;
  onSuggestionSelect: (suggestion: AddressAutocompleteSelection) => void;
  onManualEdit?: () => void;
  disabled?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  className?: string;
}

async function fetchAddressSuggestions(
  query: string,
  signal: AbortSignal,
  sessionToken: string,
  selected?: string
): Promise<AddressAutocompleteSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(ADDRESS_AUTOCOMPLETE_LIMIT),
    sessionToken,
  });
  if (selected) {
    params.set("selected", selected);
  }
  const response = await fetchWithTimeout(
    `/api/geocoding/address-autocomplete?${params.toString()}`,
    {
      signal,
      timeout: ADDRESS_AUTOCOMPLETE_TIMEOUT_MS,
    }
  );

  if (!response.ok) {
    if (response.status === 422) {
      return [];
    }
    throw new Error("Address suggestions unavailable");
  }

  const payload =
    (await response.json()) as Partial<AddressAutocompleteSuccessResponse>;
  return Array.isArray(payload.suggestions) ? payload.suggestions : [];
}

async function resolveAddressSuggestion(
  suggestion: AddressAutocompleteSuggestion,
  typedAddress: string,
  signal: AbortSignal,
  sessionToken: string
): Promise<AddressAutocompleteSuggestion | null> {
  if (!suggestion.requiresResolution) {
    return suggestion;
  }

  if (suggestion.provider === "google" && !suggestion.placeId) {
    throw new Error("Address details unavailable");
  }

  const response = await fetchWithTimeout("/api/geocoding/address-details", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      placeId: suggestion.placeId,
      sourceId: suggestion.id,
      provider: suggestion.provider,
      address: suggestion.address,
      city: suggestion.city,
      state: suggestion.state,
      zip: suggestion.zip,
      sessionToken,
      typedAddress,
    }),
    signal,
    timeout: ADDRESS_AUTOCOMPLETE_TIMEOUT_MS,
  });

  if (response.status === 422) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Address details unavailable");
  }

  const payload = (await response.json()) as AddressDetailsSuccessResponse;
  return payload.suggestion ?? null;
}

function createAutocompleteSessionToken(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2)}`.slice(0, 36);
}

function getIconColor(precision: AddressAutocompleteSuggestion["precision"]) {
  return precision === "PREMISE" ? "text-green-600" : "text-on-surface-variant";
}

function normalizeComparableValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function suggestionMatchesSelection(
  suggestion: AddressAutocompleteSuggestion,
  selection: AddressAutocompleteSelection
): boolean {
  const selectionAddress = parseAddressInput(selection.address).address;
  const suggestionState =
    normalizeUsState(suggestion.state) || suggestion.state;
  const selectionState = normalizeUsState(selection.state) || selection.state;
  return (
    normalizeComparableValue(suggestion.address) ===
      normalizeComparableValue(selectionAddress) &&
    (!selection.city ||
      normalizeComparableValue(suggestion.city) ===
        normalizeComparableValue(selection.city)) &&
    (!selectionState ||
      normalizeComparableValue(suggestionState) ===
        normalizeComparableValue(selectionState)) &&
    (!selection.zip || suggestion.zip === selection.zip)
  );
}

function getSelectionLabel(selection: AddressAutocompleteSelection): string {
  const stateZip = [selection.state, selection.zip]
    .filter((part) => part.trim().length > 0)
    .join(" ");
  return [selection.address, selection.city, stateZip]
    .filter((part) => part.trim().length > 0)
    .join(", ");
}

export default function AddressAutocompleteInput({
  id,
  name,
  value,
  city = "",
  state = "",
  zip = "",
  onChange,
  onSuggestionSelect,
  onManualEdit,
  disabled = false,
  ariaInvalid = false,
  ariaDescribedBy,
  className,
}: AddressAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<
    AddressAutocompleteSuggestion[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [secondaryPrompt, setSecondaryPrompt] = useState("");
  const [debouncedValue] = useDebounce(
    value,
    ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const cacheRef = useRef(new Map<string, AddressAutocompleteSuggestion[]>());
  const requestIdRef = useRef(0);
  const lastSelectedValueRef = useRef<string | null>(null);
  const listboxId = useId();

  const sanitizedValue = value.trim();
  const searchContext = useMemo<AddressSearchContext>(
    () => ({ city, state, zip }),
    [city, state, zip]
  );
  const parsedValue = useMemo(
    () => parseAddressInput(sanitizedValue),
    [sanitizedValue]
  );
  const manualSelection = useMemo<AddressAutocompleteSelection | null>(() => {
    if (!parsedValue.address) return null;
    return formatParsedAddressForSelection(parsedValue, searchContext);
  }, [parsedValue, searchContext]);
  const providerQuery = parsedValue.address
    ? buildAddressAutocompleteProviderQuery(sanitizedValue, searchContext)
    : "";
  const visibleSuggestions = useMemo(
    () => dedupeAddressSuggestions(suggestions),
    [suggestions]
  );
  const manualOption = useMemo<ManualAddressOption | null>(() => {
    if (!manualSelection || !providerQuery || serviceUnavailable) {
      return null;
    }
    const hasExactProviderMatch = visibleSuggestions.some((suggestion) =>
      suggestionMatchesSelection(suggestion, manualSelection)
    );
    if (hasExactProviderMatch) {
      return null;
    }

    return {
      kind: "manual",
      key: `manual:${getSelectionLabel(manualSelection).toLowerCase()}`,
      primaryText: "Use typed address",
      secondaryText: getSelectionLabel(manualSelection),
      selection: manualSelection,
    };
  }, [manualSelection, providerQuery, serviceUnavailable, visibleSuggestions]);
  const visibleOptions = useMemo<AddressAutocompleteOption[]>(
    () => [
      ...(manualOption ? [manualOption] : []),
      ...visibleSuggestions.map((suggestion) => ({
        kind: "suggestion" as const,
        suggestion,
      })),
    ],
    [manualOption, visibleSuggestions]
  );
  const canSearch =
    providerQuery.length >= ADDRESS_AUTOCOMPLETE_MIN_QUERY_LENGTH;
  const isPopupOpen =
    showSuggestions &&
    (visibleOptions.length > 0 ||
      serviceUnavailable ||
      Boolean(secondaryPrompt) ||
      (noResults && !isLoading));

  const clearTransientState = useCallback(() => {
    setServiceUnavailable(false);
    setNoResults(false);
    setSecondaryPrompt("");
  }, []);

  const getSessionToken = useCallback(() => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = createAutocompleteSessionToken();
    }

    return sessionTokenRef.current;
  }, []);

  const resetSessionToken = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const fetchSuggestions = useCallback(
    async (rawQuery: string) => {
      const trimmedQuery = rawQuery.trim();
      const parsedQuery = parseAddressInput(trimmedQuery);
      const searchQuery = parsedQuery.address
        ? buildAddressAutocompleteProviderQuery(trimmedQuery, searchContext)
        : "";
      clearTransientState();

      if (searchQuery.length < ADDRESS_AUTOCOMPLETE_MIN_QUERY_LENGTH) {
        abortRef.current?.abort();
        setSuggestions([]);
        setShowSuggestions(false);
        setIsLoading(false);
        return;
      }

      const cacheKey = searchQuery.toLowerCase();
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setSuggestions(cached);
        setSelectedIndex(-1);
        setNoResults(cached.length === 0);
        setShowSuggestions(document.activeElement === inputRef.current);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);

      try {
        const results = await fetchAddressSuggestions(
          searchQuery,
          controller.signal,
          getSessionToken()
        );
        if (requestId !== requestIdRef.current) {
          return;
        }

        cacheRef.current.set(cacheKey, results);
        setSuggestions(results);
        setSelectedIndex(-1);
        setNoResults(results.length === 0);
        setShowSuggestions(document.activeElement === inputRef.current);
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          return;
        }
        if (requestId !== requestIdRef.current) {
          return;
        }
        setSuggestions([]);
        setSelectedIndex(-1);
        setServiceUnavailable(true);
        setShowSuggestions(true);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [clearTransientState, getSessionToken, searchContext]
  );

  useEffect(() => {
    if (lastSelectedValueRef.current === debouncedValue) {
      return;
    }
    void fetchSuggestions(debouncedValue);
  }, [debouncedValue, fetchSuggestions]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (lastSelectedValueRef.current) {
        resetSessionToken();
      }
      lastSelectedValueRef.current = null;
      clearTransientState();
      onManualEdit?.();
      onChange(event.target.value);
      setShowSuggestions(true);
    },
    [clearTransientState, onChange, onManualEdit, resetSessionToken]
  );

  const handleSelectSuggestion = useCallback(
    async (suggestion: AddressAutocompleteSuggestion) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      const typedAddress = appendTypedAddressUnit(suggestion.address, value);
      setIsLoading(true);

      try {
        if (suggestion.requiresSecondaryExpansion && suggestion.selected) {
          const expansionQuery = suggestion.address;
          onManualEdit?.();
          onChange(expansionQuery);
          const expandedSuggestions = await fetchAddressSuggestions(
            expansionQuery,
            controller.signal,
            getSessionToken(),
            suggestion.selected
          );
          if (requestId !== requestIdRef.current) {
            return;
          }

          lastSelectedValueRef.current = expansionQuery;
          cacheRef.current.set(
            `${expansionQuery.toLowerCase()}:selected:${suggestion.selected}`,
            expandedSuggestions
          );
          setSuggestions(expandedSuggestions);
          setSelectedIndex(-1);
          setNoResults(expandedSuggestions.length === 0);
          setSecondaryPrompt("Continue typing or choose an apartment/unit");
          setServiceUnavailable(false);
          setShowSuggestions(true);
          return;
        }

        const resolvedSuggestion = await resolveAddressSuggestion(
          suggestion,
          typedAddress,
          controller.signal,
          getSessionToken()
        );
        if (requestId !== requestIdRef.current) {
          return;
        }

        if (!resolvedSuggestion) {
          setSuggestions([]);
          setNoResults(true);
          setShowSuggestions(true);
          setSelectedIndex(-1);
          return;
        }

        const selectedAddress =
          resolvedSuggestion.provider === "google"
            ? resolvedSuggestion.address
            : appendTypedAddressUnit(resolvedSuggestion.address, value);
        lastSelectedValueRef.current = selectedAddress;
        setShowSuggestions(false);
        setSuggestions([]);
        setSelectedIndex(-1);
        clearTransientState();
        resetSessionToken();
        onSuggestionSelect({
          address: selectedAddress,
          city: resolvedSuggestion.city,
          state: resolvedSuggestion.state,
          zip: resolvedSuggestion.zip,
          precision: resolvedSuggestion.precision,
          addressSuggestionToken: resolvedSuggestion.addressSuggestionToken,
        });
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          return;
        }
        if (requestId !== requestIdRef.current) {
          return;
        }
        setSuggestions([]);
        setSelectedIndex(-1);
        setServiceUnavailable(true);
        setShowSuggestions(document.activeElement === inputRef.current);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      clearTransientState,
      getSessionToken,
      onChange,
      onManualEdit,
      onSuggestionSelect,
      resetSessionToken,
      value,
    ]
  );

  const handleSelectManualAddress = useCallback(
    (selection: AddressAutocompleteSelection) => {
      lastSelectedValueRef.current = selection.address;
      setShowSuggestions(false);
      setSuggestions([]);
      setSelectedIndex(-1);
      clearTransientState();
      resetSessionToken();
      onSuggestionSelect(selection);
    },
    [clearTransientState, onSuggestionSelect, resetSessionToken]
  );

  const handleSelectOption = useCallback(
    (option: AddressAutocompleteOption) => {
      if (option.kind === "manual") {
        handleSelectManualAddress(option.selection);
        return;
      }
      void handleSelectSuggestion(option.suggestion);
    },
    [handleSelectManualAddress, handleSelectSuggestion]
  );

  const handleClear = useCallback(() => {
    lastSelectedValueRef.current = null;
    abortRef.current?.abort();
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    clearTransientState();
    resetSessionToken();
    onManualEdit?.();
    onChange("");
    inputRef.current?.focus();
  }, [clearTransientState, onChange, onManualEdit, resetSessionToken]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" && visibleOptions.length > 0) {
        event.preventDefault();
        setShowSuggestions(true);
        setSelectedIndex((current) =>
          current < visibleOptions.length - 1 ? current + 1 : current
        );
      }
      if (event.key === "ArrowUp" && visibleOptions.length > 0) {
        event.preventDefault();
        setSelectedIndex((current) => (current > 0 ? current - 1 : -1));
      }
      if (
        event.key === "Enter" &&
        showSuggestions &&
        selectedIndex >= 0 &&
        selectedIndex < visibleOptions.length
      ) {
        event.preventDefault();
        handleSelectOption(visibleOptions[selectedIndex]);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    },
    [handleSelectOption, selectedIndex, showSuggestions, visibleOptions]
  );

  const statusText = useMemo(() => {
    if (isLoading) return "Loading address suggestions";
    if (serviceUnavailable) return "Address suggestions unavailable";
    if (secondaryPrompt) return secondaryPrompt;
    if (noResults) return "No addresses found";
    return "";
  }, [isLoading, noResults, secondaryPrompt, serviceUnavailable]);

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        id={id}
        name={name}
        required
        maxLength={200}
        value={value}
        onChange={handleInputChange}
        onFocus={() => {
          if (
            canSearch &&
            (visibleOptions.length > 0 ||
              serviceUnavailable ||
              Boolean(secondaryPrompt))
          ) {
            setShowSuggestions(true);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setShowSuggestions(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder="123 Boulevard St"
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={isPopupOpen}
        aria-controls={isPopupOpen ? listboxId : undefined}
        aria-activedescendant={
          selectedIndex >= 0
            ? `${listboxId}-option-${selectedIndex}`
            : undefined
        }
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-busy={isLoading}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        className={ariaInvalid ? "border-red-500 pr-12" : "pr-12"}
      />

      <div className="absolute inset-y-0 right-0 flex items-center">
        {isLoading ? (
          <Loader2
            className="mr-3 h-4 w-4 animate-spin text-on-surface-variant"
            aria-hidden="true"
          />
        ) : value ? (
          <button
            type="button"
            onClick={handleClear}
            className="mr-1 flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-container-high"
            aria-label="Clear address"
            disabled={disabled}
          >
            <X className="h-3.5 w-3.5 text-on-surface-variant" />
          </button>
        ) : null}
      </div>

      {isPopupOpen && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-lowest shadow-ghost"
          role={visibleOptions.length > 0 ? undefined : "status"}
          aria-live={visibleOptions.length > 0 ? undefined : "polite"}
        >
          {visibleOptions.length > 0 ? (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Address suggestions"
              className="p-2"
            >
              {visibleOptions.map((option, index) => {
                const key =
                  option.kind === "manual"
                    ? option.key
                    : getAddressSuggestionRenderKey(option.suggestion, index);
                const primaryText =
                  option.kind === "manual"
                    ? option.primaryText
                    : option.suggestion.primaryText;
                const secondaryText =
                  option.kind === "manual"
                    ? option.secondaryText
                    : option.suggestion.secondaryText;
                const iconClassName =
                  option.kind === "manual"
                    ? "text-on-surface-variant"
                    : getIconColor(option.suggestion.precision);

                return (
                  <li
                    key={key}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={selectedIndex === index}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelectOption(option)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        selectedIndex === index
                          ? "bg-surface-container-high"
                          : "hover:bg-surface-container-high/80"
                      )}
                    >
                      <MapPin
                        className={cn(
                          "mt-0.5 h-5 w-5 flex-shrink-0",
                          iconClassName
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-on-surface">
                          {primaryText}
                        </span>
                        <span className="block truncate text-xs text-on-surface-variant">
                          {secondaryText}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center gap-3 p-4">
              <div className="rounded-full bg-surface-container-high p-2">
                {serviceUnavailable ? (
                  <WifiOff
                    className="h-5 w-5 text-on-surface-variant"
                    aria-hidden="true"
                  />
                ) : (
                  <SearchX
                    className="h-5 w-5 text-on-surface-variant"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="text-sm font-medium text-on-surface-variant">
                {statusText}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
