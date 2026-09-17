"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type NearbyPandal = {
  id: string;
  puja_name: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
};

type SubmissionState =
  | "idle"
  | "locating"
  | "checking"
  | "naming"
  | "submitting"
  | "success"
  | "error";

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
    return "Something went wrong. Please try again.";
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
    "Something went wrong. Please try again."
  );
}

export default function Home() {
  const [state, setState] = useState<SubmissionState>("idle");

  const [location, setLocation] = useState<LocationData | null>(null);

  const [nearbyPandal, setNearbyPandal] =
    useState<NearbyPandal | null>(null);

  const [pujaName, setPujaName] = useState("");

  const [message, setMessage] = useState("");

  const [errorMessage, setErrorMessage] = useState("");

  /**
   * Get the user's current location.
   */
  const getLocation = () => {
    setState("locating");
    setMessage("");
    setErrorMessage("");
    setNearbyPandal(null);

    if (!navigator.geolocation) {
      setState("error");
      setErrorMessage(
        "Your browser does not support location services."
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        setLocation(locationData);

        await checkNearbyPandals(locationData);
      },
      (error) => {
        console.error("Location error:", error);

        setState("error");

        switch (error.code) {
          case error.PERMISSION_DENIED:
            setErrorMessage(
              "Location permission was denied. Please allow location access and try again."
            );
            break;

          case error.POSITION_UNAVAILABLE:
            setErrorMessage(
              "Your location could not be determined. Please try again."
            );
            break;

          case error.TIMEOUT:
            setErrorMessage(
              "Location lookup took too long. Please try again."
            );
            break;

          default:
            setErrorMessage(
              "Unable to get your location. Please try again."
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

  /**
   * Ask Supabase whether another Pandal exists
   * within 50 meters of the user's location.
   */
  const checkNearbyPandals = async (
    locationData: LocationData
  ) => {
    setState("checking");
    setMessage("");
    setErrorMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "find_nearby_pandals",
        {
          user_lat: locationData.latitude,
          user_lng: locationData.longitude,
          radius_meters: 50,
        }
      );

      if (error) {
        console.error("Nearby Pandal check failed:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });

        /*
         * A nearby check is not allowed to prevent
         * the user from submitting a Pandal.
         *
         * If rate limiting fails here, we show a
         * friendly message rather than silently
         * pretending the check succeeded.
         */
        if (isRateLimitError(error)) {
          setState("error");
          setErrorMessage(
            "You've checked locations too frequently. Please wait a few minutes and try again."
          );
          return;
        }

        /*
         * For other RPC failures, allow the user to
         * continue with a new Pandal submission.
         *
         * This preserves the behavior of the original
         * app where duplicate detection is helpful,
         * but not a hard requirement for submission.
         */
        console.warn(
          "Duplicate detection failed. Continuing without it."
        );

        setNearbyPandal(null);
        setState("naming");
        return;
      }

      if (data && data.length > 0) {
        setNearbyPandal(data[0]);
        setState("naming");
        return;
      }

      setNearbyPandal(null);
      setState("naming");
    } catch (error) {
      console.error("Unexpected nearby check error:", error);

      setNearbyPandal(null);
      setState("naming");
    }
  };

  /**
   * Submit the Pandal.
   */
  const submitPandal = async () => {
    if (!location) {
      setState("error");
      setErrorMessage(
        "Please capture your location first."
      );
      return;
    }

    const trimmedName = pujaName.trim();

    if (!trimmedName) {
      setErrorMessage("Please enter the Puja name.");
      return;
    }

    if (trimmedName.length > 200) {
      setErrorMessage(
        "The Puja name must be 200 characters or fewer."
      );
      return;
    }

    setState("submitting");
    setMessage("");
    setErrorMessage("");

    try {
      const { error } = await supabase
        .from("pandal_submissions")
        .insert({
          puja_name: trimmedName,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          year: new Date().getFullYear(),
        });

      if (error) {
        console.error("Submission failed:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });

        if (isRateLimitError(error)) {
          setState("error");
          setErrorMessage(
            "You've submitted several Pandals recently. Please try again later."
          );
          return;
        }

        setState("error");
        setErrorMessage(getErrorMessage(error));
        return;
      }

      setState("success");
      setMessage(
        "Pandal submitted successfully. Thank you for contributing!"
      );

      setPujaName("");
    } catch (error) {
      console.error("Unexpected submission error:", error);

      if (isRateLimitError(error)) {
        setState("error");
        setErrorMessage(
          "You've submitted several Pandals recently. Please try again later."
        );
        return;
      }

      setState("error");
      setErrorMessage(
        "Something went wrong while submitting. Please try again."
      );
    }
  };

  /**
   * User confirms that the nearby Pandal is the one
   * they are currently standing at.
   *
   * We still ask for the Puja name because we want
   * the submission to contain the actual name.
   */
  const confirmNearbyPandal = () => {
    if (!nearbyPandal) {
      return;
    }

    setPujaName(nearbyPandal.puja_name);
    setState("naming");
    setErrorMessage("");
  };

  /**
   * User says the nearby result is NOT the same Pandal.
   */
  const chooseNewPandal = () => {
    setNearbyPandal(null);
    setPujaName("");
    setState("naming");
    setErrorMessage("");
  };

  /**
   * Reset the entire flow.
   */
  const reset = () => {
    setState("idle");
    setLocation(null);
    setNearbyPandal(null);
    setPujaName("");
    setMessage("");
    setErrorMessage("");
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
        }}
      >
        <h1
          style={{
            fontSize: "2.5rem",
            marginBottom: "8px",
          }}
        >
          Find Durga Puja Pandals
        </h1>

        <p
          style={{
            color: "#666",
            marginBottom: "32px",
            lineHeight: 1.6,
          }}
        >
          Help build a map of Durga Puja Pandals by sharing
          where you are.
        </p>

        {/* ------------------------------------------------ */}
        {/* STEP 1: GET LOCATION                            */}
        {/* ------------------------------------------------ */}

        {state === "idle" && (
          <button
            onClick={getLocation}
            style={{
              width: "100%",
              padding: "16px",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            📍 I&apos;m Here
          </button>
        )}

        {/* ------------------------------------------------ */}
        {/* LOCATION LOADING                                */}
        {/* ------------------------------------------------ */}

        {state === "locating" && (
          <div>
            <p>Getting your location...</p>
            <p
              style={{
                color: "#666",
                fontSize: "0.9rem",
              }}
            >
              This should only take a few seconds.
            </p>
          </div>
        )}

        {/* ------------------------------------------------ */}
        {/* DUPLICATE CHECK                                 */}
        {/* ------------------------------------------------ */}

        {state === "checking" && (
          <div>
            <p>Checking nearby Pandals...</p>
          </div>
        )}

        {/* ------------------------------------------------ */}
        {/* NAME ENTRY                                      */}
        {/* ------------------------------------------------ */}

        {state === "naming" && (
          <div>
            {nearbyPandal && (
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                }}
              >
                <p
                  style={{
                    marginTop: 0,
                    marginBottom: "8px",
                  }}
                >
                  We found a Pandal about{" "}
                  <strong>
                    {Math.round(
                      nearbyPandal.distance_meters
                    )}{" "}
                    m
                  </strong>{" "}
                  away:
                </p>

                <p
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 600,
                    marginBottom: "16px",
                  }}
                >
                  {nearbyPandal.puja_name}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                  }}
                >
                  <button
                    onClick={confirmNearbyPandal}
                    style={{
                      flex: 1,
                      padding: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Yes, this one
                  </button>

                  <button
                    onClick={chooseNewPandal}
                    style={{
                      flex: 1,
                      padding: "12px",
                      cursor: "pointer",
                    }}
                  >
                    No, new one
                  </button>
                </div>
              </div>
            )}

            <label
              htmlFor="puja-name"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 600,
              }}
            >
              Puja name
            </label>

            <input
              id="puja-name"
              type="text"
              value={pujaName}
              onChange={(event) => {
                setPujaName(event.target.value);
                setErrorMessage("");
              }}
              placeholder="e.g. Barisha Club"
              maxLength={200}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "1rem",
                boxSizing: "border-box",
                marginBottom: "12px",
              }}
            />

            <button
              onClick={submitPandal}
              disabled={!pujaName.trim()}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "1rem",
                cursor: pujaName.trim()
                  ? "pointer"
                  : "not-allowed",
              }}
            >
              Submit Pandal
            </button>

            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "12px",
                marginTop: "10px",
                cursor: "pointer",
              }}
            >
              Start over
            </button>
          </div>
        )}

        {/* ------------------------------------------------ */}
        {/* SUBMITTING                                      */}
        {/* ------------------------------------------------ */}

        {state === "submitting" && (
          <div>
            <p>Submitting Pandal...</p>
          </div>
        )}

        {/* ------------------------------------------------ */}
        {/* SUCCESS                                         */}
        {/* ------------------------------------------------ */}

        {state === "success" && (
          <div>
            <div
              style={{
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #ddd",
                marginBottom: "16px",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                }}
              >
                Thank you!
              </h2>

              <p>{message}</p>
            </div>

            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "14px",
                cursor: "pointer",
              }}
            >
              Add another Pandal
            </button>
          </div>
        )}

        {/* ------------------------------------------------ */}
        {/* ERROR                                           */}
        {/* ------------------------------------------------ */}

        {state === "error" && (
          <div>
            <div
              style={{
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #ddd",
                marginBottom: "16px",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                }}
              >
                Something went wrong
              </h2>

              <p>{errorMessage}</p>
            </div>

            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "14px",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}