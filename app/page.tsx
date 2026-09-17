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

  const combined = [err.code, err.message, err.details, err.hint]
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

  const [location, setLocation] = useState<LocationData | null>(null);

  const [pujaName, setPujaName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [area, setArea] = useState("");
  const [nearestLandmark, setNearestLandmark] = useState("");

  const [state, setState] = useState<SubmissionState>("ready");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
          accuracy: Number.isFinite(position.coords.accuracy)
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

  const submitPandal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setMessage("");
    setErrorMessage("");

    const trimmedName = pujaName.trim();
    const trimmedAddress = locationAddress.trim();
    const trimmedArea = area.trim();
    const trimmedLandmark = nearestLandmark.trim();

    if (!trimmedName) {
      setState("error");
      setErrorMessage("Please enter the pandal name.");
      return;
    }

    if (trimmedName.length > 200) {
      setState("error");
      setErrorMessage(
        "Pandal name must be 200 characters or fewer."
      );
      return;
    }

    if (locationMode === "live" && !location) {
      setState("error");
      setErrorMessage(
        "Please allow live location or switch back to manual location."
      );
      return;
    }

    if (locationMode === "manual") {
      if (!trimmedAddress) {
        setState("error");
        setErrorMessage("Please enter the location or address.");
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
        setErrorMessage("Please enter the area.");
        return;
      }

      if (trimmedArea.length > 100) {
        setState("error");
        setErrorMessage(
          "Area must be 100 characters or fewer."
        );
        return;
      }
    }

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

      area: trimmedArea || null,

      nearest_landmark:
        trimmedLandmark || null,

      year: new Date().getFullYear(),
    };

    const { error } = await supabase
      .from("pandal_submissions")
      .insert(submission);

    if (error) {
      console.error("Pandal submission error:", error);

      setState("error");

      if (isRateLimitError(error)) {
        setErrorMessage(
          "You've reached the submission limit. Please try again later."
        );
      } else {
        setErrorMessage(getErrorMessage(error));
      }

      return;
    }

    setState("success");
    setMessage(
      "Pandal added successfully. Thank you for helping build the map!"
    );
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F8F3E7",
        color: "#173B3A",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "760px",
          margin: "0 auto",
          padding: "24px 18px 0",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <header
          style={{
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: "#087F7B",
              color: "#FFFDF7",
              fontSize: "27px",
              marginBottom: "12px",
              boxShadow:
                "0 8px 24px rgba(8, 127, 123, 0.18)",
            }}
          >
            ॐ
          </div>

          <div
            style={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.16em",
              color: "#087F7B",
              marginBottom: "5px",
            }}
          >
            DURGA PUJA • KOLKATA
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(34px, 8vw, 52px)",
              lineHeight: 1,
              letterSpacing: "-0.045em",
              fontWeight: 900,
              color: "#075E5B",
            }}
          >
            PandalGO
          </h1>

          <p
            style={{
              maxWidth: "520px",
              margin: "12px auto 0",
              fontSize: "15px",
              lineHeight: 1.6,
              color: "#667674",
            }}
          >
            Help build a living map of Kolkata&apos;s Durga Puja
            pandals.
          </p>
        </header>

        {/* Main Card */}
        <section
          style={{
            background: "#FFFDF7",
            border: "1px solid #D8E2DC",
            borderRadius: "24px",
            padding: "clamp(20px, 5vw, 34px)",
            boxShadow:
              "0 16px 50px rgba(23, 59, 58, 0.07)",
          }}
        >
          <div style={{ marginBottom: "26px" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#087F7B",
                marginBottom: "7px",
              }}
            >
              Add a Pandal
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "25px",
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
              }}
            >
              Know a Puja that&apos;s missing?
            </h2>

            <p
              style={{
                margin: "8px 0 0",
                color: "#667674",
                fontSize: "14px",
                lineHeight: 1.55,
              }}
            >
              Add its details and help someone discover it.
            </p>
          </div>

          <form onSubmit={submitPandal}>
            {/* Pandal Name */}
            <div style={{ marginBottom: "22px" }}>
              <label
                htmlFor="puja-name"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 800,
                  marginBottom: "8px",
                }}
              >
                Pandal Name
                <span style={{ color: "#087F7B" }}> *</span>
              </label>

              <input
                id="puja-name"
                type="text"
                value={pujaName}
                onChange={(event) =>
                  setPujaName(event.target.value)
                }
                placeholder="e.g. Barisha Club"
                maxLength={200}
                disabled={
                  state === "locating" ||
                  state === "submitting"
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #D8E2DC",
                  borderRadius: "12px",
                  padding: "13px 14px",
                  background: "#FFFFFF",
                  color: "#173B3A",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
            </div>

            {/* Location */}
            <div style={{ marginBottom: "22px" }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 800,
                  marginBottom: "10px",
                }}
              >
                Location
                <span style={{ color: "#087F7B" }}> *</span>
              </div>

              {/* Live Location Toggle */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  padding: "13px 14px",
                  borderRadius: "12px",
                  background: "#D9EFEC",
                  border: "1px solid #C4E3DF",
                  cursor:
                    state === "submitting"
                      ? "not-allowed"
                      : "pointer",
                  marginBottom: "14px",
                }}
              >
                <input
                  type="checkbox"
                  checked={locationMode === "live"}
                  onChange={(event) =>
                    handleLocationModeChange(
                      event.target.checked
                    )
                  }
                  disabled={state === "submitting"}
                  style={{
                    width: "17px",
                    height: "17px",
                    accentColor: "#087F7B",
                    cursor: "pointer",
                  }}
                />

                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 800,
                    }}
                  >
                    Add live location
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: "#667674",
                      marginTop: "2px",
                    }}
                  >
                    Use your current GPS location
                  </div>
                </div>
              </label>

              {/* Live Location Status */}
              {locationMode === "live" &&
                state === "locating" && (
                  <div
                    style={{
                      padding: "13px 14px",
                      borderRadius: "12px",
                      background: "#F8F3E7",
                      color: "#667674",
                      fontSize: "13px",
                      marginBottom: "14px",
                    }}
                  >
                    Getting your location...
                  </div>
                )}

              {locationMode === "live" &&
                location &&
                state !== "locating" && (
                  <div
                    style={{
                      padding: "13px 14px",
                      borderRadius: "12px",
                      background: "#F0F8F6",
                      border: "1px solid #CDE5E1",
                      color: "#075E5B",
                      fontSize: "13px",
                      marginBottom: "14px",
                    }}
                  >
                    Live location added successfully.
                  </div>
                )}

              {/* Manual Location Fields */}
              {locationMode === "manual" && (
                <>
                  <div style={{ marginBottom: "14px" }}>
                    <label
                      htmlFor="location-address"
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 700,
                        marginBottom: "8px",
                      }}
                    >
                      Location / Address
                      <span style={{ color: "#087F7B" }}>
                        {" "}
                        *
                      </span>
                    </label>

                    <textarea
                      id="location-address"
                      value={locationAddress}
                      onChange={(event) =>
                        setLocationAddress(
                          event.target.value
                        )
                      }
                      placeholder="e.g. 123 Diamond Harbour Road"
                      maxLength={500}
                      rows={3}
                      disabled={state === "submitting"}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        border: "1px solid #D8E2DC",
                        borderRadius: "12px",
                        padding: "13px 14px",
                        background: "#FFFFFF",
                        color: "#173B3A",
                        fontSize: "14px",
                        lineHeight: 1.5,
                        resize: "vertical",
                        outline: "none",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label
                      htmlFor="area"
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 700,
                        marginBottom: "8px",
                      }}
                    >
                      Area
                      <span style={{ color: "#087F7B" }}>
                        {" "}
                        *
                      </span>
                    </label>

                    <input
                      id="area"
                      type="text"
                      value={area}
                      onChange={(event) =>
                        setArea(event.target.value)
                      }
                      placeholder="e.g. Barisha"
                      maxLength={100}
                      disabled={state === "submitting"}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        border: "1px solid #D8E2DC",
                        borderRadius: "12px",
                        padding: "13px 14px",
                        background: "#FFFFFF",
                        color: "#173B3A",
                        fontSize: "14px",
                        outline: "none",
                      }}
                    />
                  </div>
                </>
              )}

              {/* Nearest Landmark */}
              <div>
                <label
                  htmlFor="nearest-landmark"
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    marginBottom: "8px",
                  }}
                >
                  Nearest Landmark
                  <span
                    style={{
                      fontWeight: 500,
                      color: "#667674",
                    }}
                  >
                    {" "}
                    (optional)
                  </span>
                </label>

                <input
                  id="nearest-landmark"
                  type="text"
                  value={nearestLandmark}
                  onChange={(event) =>
                    setNearestLandmark(event.target.value)
                  }
                  placeholder="e.g. Near Barisha High School"
                  maxLength={200}
                  disabled={state === "submitting"}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid #D8E2DC",
                    borderRadius: "12px",
                    padding: "13px 14px",
                    background: "#FFFFFF",
                    color: "#173B3A",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Privacy Note */}
            <div
              style={{
                display: "flex",
                gap: "9px",
                alignItems: "flex-start",
                padding: "12px 13px",
                borderRadius: "12px",
                background: "#F8F3E7",
                color: "#667674",
                fontSize: "12px",
                lineHeight: 1.5,
                marginBottom: "20px",
              }}
            >
              <span
                style={{
                  color: "#087F7B",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                ●
              </span>

              <span>
                Live location is optional. You can enter the
                location manually instead.
              </span>
            </div>

            {/* Error */}
            {state === "error" && errorMessage && (
              <div
                role="alert"
                style={{
                  padding: "13px 14px",
                  borderRadius: "12px",
                  background: "#FFF1EF",
                  border: "1px solid #F0D0CA",
                  color: "#9A3E31",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  marginBottom: "16px",
                }}
              >
                {errorMessage}
              </div>
            )}

            {/* Success */}
            {state === "success" && message && (
              <div
                role="status"
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  background: "#EAF7F3",
                  border: "1px solid #C5E5DD",
                  color: "#075E5B",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  marginBottom: "16px",
                }}
              >
                {message}
              </div>
            )}

            {/* General Message */}
            {state !== "success" &&
              state !== "error" &&
              message && (
                <div
                  style={{
                    padding: "13px 14px",
                    borderRadius: "12px",
                    background: "#F0F8F6",
                    color: "#075E5B",
                    fontSize: "13px",
                    marginBottom: "16px",
                  }}
                >
                  {message}
                </div>
              )}

            {/* Submit */}
            {state === "success" ? (
              <button
                type="button"
                onClick={reset}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: "13px",
                  padding: "14px 18px",
                  background: "#087F7B",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow:
                    "0 8px 20px rgba(8, 127, 123, 0.18)",
                }}
              >
                Add Another Pandal
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  state === "locating" ||
                  state === "submitting"
                }
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: "13px",
                  padding: "14px 18px",
                  background:
                    state === "locating" ||
                    state === "submitting"
                      ? "#A8C8C5"
                      : "#087F7B",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 800,
                  cursor:
                    state === "locating" ||
                    state === "submitting"
                      ? "not-allowed"
                      : "pointer",
                  boxShadow:
                    state === "locating" ||
                    state === "submitting"
                      ? "none"
                      : "0 8px 20px rgba(8, 127, 123, 0.18)",
                }}
              >
                {state === "locating"
                  ? "Getting Location..."
                  : state === "submitting"
                    ? "Adding Pandal..."
                    : "Add Pandal"}
              </button>
            )}
          </form>
        </section>

        {/* Footer */}
        <footer
          style={{
            marginTop: "30px",
            padding: "18px 16px 28px",
            textAlign: "center",
            color: "#667674",
            fontSize: "13px",
          }}
        >
          <span>Built by </span>

          <a
            href="https://x.com/rajtilakjee"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#087F7B",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            @rajtilakjee
          </a>
        </footer>
      </div>
    </main>
  );
}