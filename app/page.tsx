"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

type LocationMode = "manual" | "live";

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type SubmissionState =
  | "ready"
  | "locating"
  | "submitting"
  | "success"
  | "error";

const AREA_OPTIONS = [
  "North Kolkata",
  "South Kolkata",
  "Central Kolkata",
  "Salt Lake",
];

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const combined = [
    err.code,
    err.message,
    err.details,
    err.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    combined.includes("429") ||
    combined.includes("too many requests") ||
    combined.includes("rate limit") ||
    combined.includes("submission limit")
  );
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Something went wrong while submitting the pandal.";
  }

  const err = error as {
    message?: string;
    details?: string;
    hint?: string;
  };

  return (
    err.message ||
    err.details ||
    err.hint ||
    "Something went wrong while submitting the pandal."
  );
}

export default function Home() {
  const [locationMode, setLocationMode] =
    useState<LocationMode>("manual");

  const [location, setLocation] =
    useState<LocationData | null>(null);

  const [pujaName, setPujaName] = useState("");
  const [locationAddress, setLocationAddress] =
    useState("");
  const [area, setArea] = useState("");
  const [nearestLandmark, setNearestLandmark] =
    useState("");

  const [state, setState] =
    useState<SubmissionState>("ready");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] =
    useState("");

  const getLiveLocation = () => {
    if (!navigator.geolocation) {
      setLocationMode("manual");
      setLocation(null);
      setState("error");

      setErrorMessage(
        "Live location is not supported by your browser. You can enter the location manually."
      );

      return;
    }

    setState("locating");
    setMessage("");
    setErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(
            position.coords.accuracy
          )
            ? position.coords.accuracy
            : null,
        });

        setState("ready");
        setMessage("Live location added.");
      },

      (error) => {
        setLocationMode("manual");
        setLocation(null);
        setState("error");

        switch (error.code) {
          case error.PERMISSION_DENIED:
            setErrorMessage(
              "Location permission was denied. You can enter the location manually instead."
            );
            break;

          case error.POSITION_UNAVAILABLE:
            setErrorMessage(
              "Your location could not be determined. Please enter the location manually."
            );
            break;

          case error.TIMEOUT:
            setErrorMessage(
              "Getting your location took too long. Please enter the location manually."
            );
            break;

          default:
            setErrorMessage(
              "We couldn't get your location. You can enter it manually."
            );
        }
      },

      {
        enableHighAccuracy: false,
        maximumAge: 30000,
        timeout: 5000,
      }
    );
  };

  const handleLocationModeChange = (
    checked: boolean
  ) => {
    if (checked) {
      setLocationMode("live");
      getLiveLocation();
    } else {
      setLocationMode("manual");
      setLocation(null);
      setState("ready");
      setMessage("");
      setErrorMessage("");
    }
  };

  const reset = () => {
    setPujaName("");
    setLocationAddress("");
    setArea("");
    setNearestLandmark("");

    setLocation(null);
    setLocationMode("manual");

    setState("ready");
    setMessage("");
    setErrorMessage("");
  };

  const submitPandal = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setMessage("");
    setErrorMessage("");

    const trimmedName = pujaName.trim();
    const trimmedAddress =
      locationAddress.trim();
    const trimmedArea = area.trim();
    const trimmedLandmark =
      nearestLandmark.trim();

    /*
     * Pandal name validation
     */
    if (!trimmedName) {
      setState("error");
      setErrorMessage(
        "Please enter the pandal name."
      );
      return;
    }

    if (trimmedName.length > 200) {
      setState("error");
      setErrorMessage(
        "Pandal name must be 200 characters or fewer."
      );
      return;
    }

    /*
     * Live location validation
     */
    if (
      locationMode === "live" &&
      !location
    ) {
      setState("error");
      setErrorMessage(
        "Please allow live location or switch back to manual location."
      );
      return;
    }

    /*
     * Manual location validation
     */
    if (locationMode === "manual") {
      if (!trimmedAddress) {
        setState("error");
        setErrorMessage(
          "Please enter the location or address."
        );
        return;
      }

      if (trimmedAddress.length > 500) {
        setState("error");
        setErrorMessage(
          "Location or address must be 500 characters or fewer."
        );
        return;
      }

      if (!trimmedArea) {
        setState("error");
        setErrorMessage(
          "Please select an area."
        );
        return;
      }

      if (!AREA_OPTIONS.includes(trimmedArea)) {
        setState("error");
        setErrorMessage(
          "Please select a valid area."
        );
        return;
      }
    }

    /*
     * Landmark validation
     */
    if (trimmedLandmark.length > 200) {
      setState("error");
      setErrorMessage(
        "Nearest landmark must be 200 characters or fewer."
      );
      return;
    }

    setState("submitting");

    const submission = {
      puja_name: trimmedName,

      latitude:
        locationMode === "live"
          ? location?.latitude
          : null,

      longitude:
        locationMode === "live"
          ? location?.longitude
          : null,

      accuracy:
        locationMode === "live"
          ? location?.accuracy
          : null,

      location_address:
        locationMode === "manual"
          ? trimmedAddress
          : null,

      area:
        locationMode === "manual"
          ? trimmedArea
          : null,

      nearest_landmark:
        trimmedLandmark || null,

      year: new Date().getFullYear(),
    };

    const { error } = await supabase
      .from("pandal_submissions")
      .insert(submission);

    if (error) {
      console.error(
        "Pandal submission error:",
        error
      );

      setState("error");

      if (isRateLimitError(error)) {
        setErrorMessage(
          "You've reached the submission limit. Please try again later."
        );
      } else {
        setErrorMessage(
          getErrorMessage(error)
        );
      }

      return;
    }

    setState("success");

    setMessage(
      "Pandal added successfully. Thank you for helping build the map!"
    );
  };

  return (
    <main className="min-h-screen bg-white text-zinc-950 font-sans antialiased flex flex-col">
      <div className="w-full max-w-lg mx-auto px-4 py-10 sm:px-6 sm:py-12 flex-1">

        {/* ============================================
            HEADER
        ============================================ */}

        <header className="text-center space-y-3 mb-8">

          {/* Location Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-800 text-xs font-mono font-medium tracking-tight">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-900"
            >
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>

            <span>Kolkata Puja Directory</span>
          </div>

          {/* Logo */}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 font-mono">
            Pandal
            <span className="underline decoration-1 underline-offset-4">
              MAP
            </span>
          </h1>

          <p className="text-xs font-mono text-zinc-500 max-w-sm mx-auto">
            Help build a living map of Kolkata&apos;s
            Durga Puja pandals.
          </p>
        </header>

        {/* ============================================
            FORM CARD
        ============================================ */}

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 sm:p-8">

          <form
            onSubmit={submitPandal}
            className="space-y-6"
          >

            {/* ========================================
                SEPARATOR
            ======================================== */}

            <div className="border-t border-zinc-200" />

            {/* ========================================
                PANDAL NAME
            ======================================== */}

            <div className="space-y-2">
              <label
                htmlFor="pandal-name"
                className="text-sm font-medium leading-none text-zinc-950 flex justify-between"
              >
                <span>Pandal Name</span>

                <span className="font-mono text-xs text-zinc-400">
                  Required
                </span>
              </label>

              <input
                type="text"
                id="pandal-name"
                value={pujaName}
                onChange={(event) =>
                  setPujaName(
                    event.target.value
                  )
                }
                placeholder="e.g. Barisha Club"
                maxLength={200}
                disabled={
                  state === "locating" ||
                  state === "submitting"
                }
                required
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* ========================================
                LOCATION
            ======================================== */}

            <div className="space-y-3">

              <label className="text-sm font-medium leading-none text-zinc-950">
                Location
              </label>

              {/* ========================================
                INFO BOX
            ======================================== */}

            <div className="flex items-start gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 font-mono">

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-950 flex-shrink-0 mt-0.5"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>

              <span>
                Live location is optional.
                Manual entries work fine if
                GPS permission is denied.
              </span>
            </div>

              {/* ======================================
                  LIVE LOCATION
              ====================================== */}

              <button
                type="button"
                onClick={() =>
                  handleLocationModeChange(
                    locationMode !== "live"
                  )
                }
                disabled={
                  state === "submitting" ||
                  state === "locating"
                }
                className={`w-full flex items-center justify-between p-3.5 rounded-lg border transition-all text-left group disabled:cursor-not-allowed disabled:opacity-60 ${
                  locationMode === "live"
                    ? "border-zinc-950 bg-zinc-50"
                    : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                }`}
              >
                <div className="flex items-center gap-3">

                  <div className="p-2 rounded-md bg-zinc-950 text-white shadow-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                      />
                      <line
                        x1="22"
                        x2="18"
                        y1="12"
                        y2="12"
                      />
                      <line
                        x1="6"
                        x2="2"
                        y1="12"
                        y2="12"
                      />
                      <line
                        x1="12"
                        x2="12"
                        y1="6"
                        y2="2"
                      />
                      <line
                        x1="12"
                        x2="12"
                        y1="22"
                        y2="18"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3"
                      />
                    </svg>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-zinc-950">
                      Add Live Location (GPS)
                    </p>

                    <p className="text-xs font-mono text-zinc-500">
                      Click/Tap here to auto-detect GPS coordinates
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-950 bg-zinc-200 border border-zinc-300 px-2 py-0.5 rounded">
                  {state === "locating"
                    ? "..."
                    : "GPS"}
                </span>
              </button>

              {/* ======================================
                  LIVE LOCATION SUCCESS
              ====================================== */}

              {locationMode === "live" &&
                location &&
                state !== "locating" && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono text-zinc-600">
                    <div className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>

                      <span>
                        Live location added
                        successfully.
                      </span>
                    </div>
                  </div>
                )}

              {/* ======================================
                  OR DIVIDER
              ====================================== */}

              {locationMode === "manual" && (
                <>
                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-zinc-200" />

                    <span className="flex-shrink mx-4 text-[10px] font-mono font-semibold text-zinc-400 tracking-wider uppercase">
                      Or Enter Address
                    </span>

                    <div className="flex-grow border-t border-zinc-200" />
                  </div>

                  {/* ==================================
                      MANUAL ADDRESS
                  ================================== */}

                  <div className="space-y-4">

                    <div className="space-y-1.5">
                      <label
                        htmlFor="address"
                        className="text-xs font-mono text-zinc-600"
                      >
                        Street Address
                        <span className="text-zinc-400">
                          {" "}
                          *
                        </span>
                      </label>

                      <textarea
                        id="address"
                        value={locationAddress}
                        onChange={(event) =>
                          setLocationAddress(
                            event.target.value
                          )
                        }
                        rows={2}
                        maxLength={500}
                        placeholder="e.g. 123 Diamond Harbour Road"
                        disabled={
                          state === "submitting"
                        }
                        className="flex w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 resize-none disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    {/* ==================================
                        AREA
                    ================================== */}

                    <div className="space-y-1.5">
                      <label
                        htmlFor="area"
                        className="text-xs font-mono text-zinc-600"
                      >
                        Area / Zone
                        <span className="text-zinc-400">
                          {" "}
                          *
                        </span>
                      </label>

                      <div className="relative">

                        <select
                          id="area"
                          value={area}
                          onChange={(event) =>
                            setArea(
                              event.target.value
                            )
                          }
                          disabled={
                            state === "submitting"
                          }
                          required
                          className={`flex h-9 w-full appearance-none rounded-md border border-zinc-200 bg-transparent px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 ${
                            area
                              ? "text-zinc-900"
                              : "text-zinc-400"
                          }`}
                        >
                          <option value="">
                            Select an area...
                          </option>

                          {AREA_OPTIONS.map(
                            (option) => (
                              <option
                                key={option}
                                value={option}
                              >
                                {option}
                              </option>
                            )
                          )}
                        </select>

                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>

                      </div>
                    </div>

                    {/* ==================================
                        LANDMARK
                    ================================== */}

                    <div className="space-y-1.5">
                      <label
                        htmlFor="landmark"
                        className="text-xs font-mono text-zinc-600"
                      >
                        Nearest Landmark{" "}
                        <span className="text-zinc-400">
                          (optional)
                        </span>
                      </label>

                      <input
                        type="text"
                        id="landmark"
                        value={nearestLandmark}
                        onChange={(event) =>
                          setNearestLandmark(
                            event.target.value
                          )
                        }
                        maxLength={200}
                        placeholder="e.g. Near Barisha High School"
                        disabled={
                          state === "submitting"
                        }
                        className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                  </div>
                </>
              )}

              {/* ======================================
                  LOCATING MESSAGE
              ====================================== */}

              {locationMode === "live" &&
                state === "locating" && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono text-zinc-500">
                    Detecting your GPS location...
                  </div>
                )}

            </div>

            {/* ========================================
                ERROR MESSAGE
            ======================================== */}

            {state === "error" &&
              errorMessage && (
                <div
                  role="alert"
                  className="rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-xs font-mono text-zinc-700"
                >
                  {errorMessage}
                </div>
              )}

            {/* ========================================
                SUCCESS MESSAGE
            ======================================== */}

            {state === "success" &&
              message && (
                <div
                  role="status"
                  className="rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-xs font-mono text-zinc-700"
                >
                  <div className="flex items-start gap-2">

                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="flex-shrink-0 mt-0.5 text-zinc-950"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>

                    <span>{message}</span>

                  </div>
                </div>
              )}

            {/* ========================================
                SUBMIT BUTTON
            ======================================== */}

            {state === "success" ? (
              <button
                type="button"
                onClick={reset}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 active:scale-[0.99]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>

                <span>
                  Add Another Pandal
                </span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  state === "locating" ||
                  state === "submitting"
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === "submitting" ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-spin"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>

                    <span>
                      Adding Pandal...
                    </span>
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>

                    <span>
                      Add Pandal
                    </span>
                  </>
                )}
              </button>
            )}

          </form>
        </div>
      </div>

      {/* ============================================
          FOOTER
      ============================================ */}

      <footer className="text-center font-mono text-xs text-zinc-400 pb-8 px-4">
        Built by{" "}
        <a
          href="https://x.com/rajtilakjee"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-950 hover:underline underline-offset-4"
        >
          @rajtilakjee
        </a>
      </footer>
    </main>
  );
}