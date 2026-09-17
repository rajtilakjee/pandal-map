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
  const [state, setState] =
    useState<SubmissionState>("idle");

  const [location, setLocation] =
    useState<LocationData | null>(null);

  const [nearbyPandal, setNearbyPandal] =
    useState<NearbyPandal | null>(null);

  const [pujaName, setPujaName] = useState("");

  const [message, setMessage] = useState("");

  const [errorMessage, setErrorMessage] = useState("");

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
        console.error(
          "Nearby Pandal check failed:",
          {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          }
        );

        if (isRateLimitError(error)) {
          setState("error");
          setErrorMessage(
            "You've checked locations too frequently. Please wait a few minutes and try again."
          );
          return;
        }

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
      console.error(
        "Unexpected nearby check error:",
        error
      );

      setNearbyPandal(null);
      setState("naming");
    }
  };

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
        console.error(
          "Submission failed:",
          {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          }
        );

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
      console.error(
        "Unexpected submission error:",
        error
      );

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

  const confirmNearbyPandal = () => {
    if (!nearbyPandal) {
      return;
    }

    setPujaName(nearbyPandal.puja_name);
    setState("naming");
    setErrorMessage("");
  };

  const chooseNewPandal = () => {
    setNearbyPandal(null);
    setPujaName("");
    setState("naming");
    setErrorMessage("");
  };

  const reset = () => {
    setState("idle");
    setLocation(null);
    setNearbyPandal(null);
    setPujaName("");
    setMessage("");
    setErrorMessage("");
  };

  return (
    <main className="page">
      <div className="background-decoration decoration-one" />
      <div className="background-decoration decoration-two" />

      <div className="container">
        {/* Header */}

        <header className="header">
          <div className="logo-mark">
            <span>ॐ</span>
          </div>

          <div>
            <p className="eyebrow">
              DURGA PUJA • KOLKATA
            </p>

            <h1>
              Pandal
              <span>GO</span>
            </h1>
          </div>
        </header>

        <p className="intro">
          Find a Puja. Share a Puja.
          <br />
          Help build the map.
        </p>

        {/* Main Card */}

        <section className="card">
          {/* Idle */}

          {state === "idle" && (
            <div className="start-screen">
              <div className="location-icon">
                <span>⌖</span>
              </div>

              <h2>
                Where are you?
              </h2>

              <p>
                We&apos;ll use your location to find
                nearby Pandals and add new ones to
                the map.
              </p>

              <button
                className="primary-button"
                onClick={getLocation}
              >
                <span className="button-icon">
                  📍
                </span>

                I&apos;m Here
              </button>

              <p className="privacy-note">
                Your location is only used to find
                nearby Pandals.
              </p>
            </div>
          )}

          {/* Locating */}

          {state === "locating" && (
            <div className="status-screen">
              <div className="spinner" />

              <h2>
                Finding you...
              </h2>

              <p>
                Getting your current location.
              </p>
            </div>
          )}

          {/* Checking */}

          {state === "checking" && (
            <div className="status-screen">
              <div className="spinner" />

              <h2>
                Looking nearby...
              </h2>

              <p>
                Checking whether someone has
                already found this Pandal.
              </p>
            </div>
          )}

          {/* Naming */}

          {state === "naming" && (
            <div className="form-screen">
              {nearbyPandal && (
                <div className="nearby-card">
                  <div className="nearby-label">
                    PANDAL FOUND NEARBY
                  </div>

                  <h2>
                    {nearbyPandal.puja_name}
                  </h2>

                  <p>
                    About{" "}
                    <strong>
                      {Math.round(
                        nearbyPandal.distance_meters
                      )}{" "}
                      m
                    </strong>{" "}
                    from your location
                  </p>

                  <div className="choice-buttons">
                    <button
                      className="secondary-button"
                      onClick={confirmNearbyPandal}
                    >
                      ✓ Yes, this one
                    </button>

                    <button
                      className="outline-button"
                      onClick={chooseNewPandal}
                    >
                      No, new one
                    </button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="puja-name">
                  Puja name
                </label>

                <input
                  id="puja-name"
                  type="text"
                  value={pujaName}
                  onChange={(event) => {
                    setPujaName(
                      event.target.value
                    );
                    setErrorMessage("");
                  }}
                  placeholder="e.g. Barisha Club"
                  maxLength={200}
                  autoComplete="off"
                />

                <div className="character-count">
                  {pujaName.length}/200
                </div>
              </div>

              <button
                className="primary-button"
                onClick={submitPandal}
                disabled={!pujaName.trim()}
              >
                Add Pandal
              </button>

              <button
                className="text-button"
                onClick={reset}
              >
                ← Start over
              </button>
            </div>
          )}

          {/* Submitting */}

          {state === "submitting" && (
            <div className="status-screen">
              <div className="spinner" />

              <h2>
                Adding Pandal...
              </h2>

              <p>
                Just a moment.
              </p>
            </div>
          )}

          {/* Success */}

          {state === "success" && (
            <div className="success-screen">
              <div className="success-icon">
                ✓
              </div>

              <div className="success-label">
                ADDED TO THE MAP
              </div>

              <h2>
                Thank you!
              </h2>

              <p>
                {message}
              </p>

              <button
                className="primary-button"
                onClick={reset}
              >
                Add another Pandal
              </button>
            </div>
          )}

          {/* Error */}

          {state === "error" && (
            <div className="error-screen">
              <div className="error-icon">
                !
              </div>

              <h2>
                Something went wrong
              </h2>

              <p>
                {errorMessage}
              </p>

              <button
                className="primary-button"
                onClick={reset}
              >
                Try again
              </button>
            </div>
          )}
        </section>

        {/* Footer */}

        <footer>
          <span>
            Made for the Puja season
          </span>

          <span className="footer-dot">
            •
          </span>

          <span>
            One Pandal at a time
          </span>
        </footer>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f8f3e7;
          color: #173b3a;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 40px 20px;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .container {
          width: 100%;
          max-width: 500px;
          position: relative;
          z-index: 2;
        }

        .background-decoration {
          position: fixed;
          border-radius: 999px;
          pointer-events: none;
          z-index: 0;
        }

        .decoration-one {
          width: 420px;
          height: 420px;
          background: #d9efec;
          opacity: 0.65;
          top: -180px;
          right: -160px;
        }

        .decoration-two {
          width: 300px;
          height: 300px;
          background: #efd9a7;
          opacity: 0.35;
          bottom: -150px;
          left: -130px;
        }

        .header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 18px;
        }

        .logo-mark {
          width: 52px;
          height: 52px;
          background: #087f7b;
          color: #fffdf7;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          box-shadow:
            0 8px 24px rgba(8, 127, 123, 0.2);
        }

        .eyebrow {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.15em;
          color: #087f7b;
          margin: 0 0 3px;
        }

        h1 {
          margin: 0;
          font-size: 30px;
          line-height: 1;
          letter-spacing: -0.04em;
          font-weight: 800;
        }

        h1 span {
          color: #087f7b;
        }

        .intro {
          color: #667674;
          font-size: 15px;
          line-height: 1.55;
          margin: 0 0 24px 66px;
        }

        .card {
          background: #fffdf7;
          border: 1px solid #d8e2dc;
          border-radius: 24px;
          padding: 30px;
          box-shadow:
            0 20px 60px rgba(23, 59, 58, 0.08);
        }

        .start-screen,
        .status-screen,
        .success-screen,
        .error-screen {
          text-align: center;
        }

        .location-icon {
          width: 72px;
          height: 72px;
          margin: 0 auto 20px;
          border-radius: 22px;
          background: #d9efec;
          color: #087f7b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 38px;
        }

        .start-screen h2,
        .status-screen h2,
        .success-screen h2,
        .error-screen h2 {
          margin: 0 0 10px;
          font-size: 24px;
          letter-spacing: -0.02em;
        }

        .start-screen p,
        .status-screen p,
        .success-screen p,
        .error-screen p {
          color: #667674;
          font-size: 14px;
          line-height: 1.6;
          margin: 0 auto 24px;
          max-width: 370px;
        }

        .primary-button {
          width: 100%;
          border: 0;
          border-radius: 14px;
          background: #087f7b;
          color: #fffdf7;
          padding: 15px 20px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition:
            background 0.2s ease,
            transform 0.2s ease,
            box-shadow 0.2s ease;
          box-shadow:
            0 8px 20px rgba(8, 127, 123, 0.18);
        }

        .primary-button:hover:not(:disabled) {
          background: #075e5b;
          transform: translateY(-1px);
          box-shadow:
            0 10px 24px rgba(8, 127, 123, 0.24);
        }

        .primary-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .primary-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }

        .button-icon {
          margin-right: 8px;
        }

        .privacy-note {
          font-size: 11px !important;
          margin-top: 14px !important;
          margin-bottom: 0 !important;
          color: #8a9693 !important;
        }

        .spinner {
          width: 42px;
          height: 42px;
          border: 3px solid #d9efec;
          border-top-color: #087f7b;
          border-radius: 50%;
          margin: 10px auto 22px;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .nearby-card {
          background: #d9efec;
          border: 1px solid #b8ded9;
          border-radius: 18px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .nearby-label {
          color: #087f7b;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.13em;
          margin-bottom: 9px;
        }

        .nearby-card h2 {
          margin: 0 0 7px;
          font-size: 20px;
          color: #075e5b;
        }

        .nearby-card p {
          margin: 0 0 18px;
          color: #4e6967;
          font-size: 13px;
        }

        .choice-buttons {
          display: flex;
          gap: 10px;
        }

        .secondary-button,
        .outline-button {
          flex: 1;
          padding: 12px;
          border-radius: 11px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .secondary-button {
          border: 1px solid #087f7b;
          background: #087f7b;
          color: #fffdf7;
        }

        .outline-button {
          border: 1px solid #9bbdb9;
          background: #fffdf7;
          color: #075e5b;
        }

        .form-group {
          position: relative;
          margin-bottom: 14px;
        }

        .form-group label {
          display: block;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .form-group input {
          width: 100%;
          box-sizing: border-box;
          padding: 15px 48px 15px 15px;
          border: 1px solid #cbd9d5;
          border-radius: 13px;
          background: #fffdf7;
          color: #173b3a;
          font-size: 15px;
          outline: none;
          transition:
            border 0.2s ease,
            box-shadow 0.2s ease;
        }

        .form-group input::placeholder {
          color: #9aa8a5;
        }

        .form-group input:focus {
          border-color: #087f7b;
          box-shadow:
            0 0 0 3px rgba(8, 127, 123, 0.1);
        }

        .character-count {
          position: absolute;
          right: 12px;
          bottom: 14px;
          color: #91a09d;
          font-size: 10px;
        }

        .text-button {
          display: block;
          width: 100%;
          margin-top: 14px;
          border: 0;
          background: transparent;
          color: #667674;
          font-size: 13px;
          cursor: pointer;
          padding: 8px;
        }

        .text-button:hover {
          color: #087f7b;
        }

        .success-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 18px;
          border-radius: 50%;
          background: #087f7b;
          color: #fffdf7;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
          font-weight: 700;
          box-shadow:
            0 10px 25px rgba(8, 127, 123, 0.2);
        }

        .success-label {
          color: #087f7b;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          margin-bottom: 9px;
        }

        .error-icon {
          width: 56px;
          height: 56px;
          margin: 0 auto 18px;
          border-radius: 50%;
          background: #efd9a7;
          color: #765f2b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 25px;
          font-weight: 800;
        }

        footer {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 9px;
          margin-top: 22px;
          color: #87938f;
          font-size: 11px;
        }

        .footer-dot {
          color: #087f7b;
        }

        @media (max-width: 520px) {
          .page {
            padding: 24px 15px;
            align-items: flex-start;
            padding-top: 45px;
          }

          .card {
            padding: 24px 20px;
            border-radius: 20px;
          }

          h1 {
            font-size: 27px;
          }

          .intro {
            margin-left: 0;
          }

          .choice-buttons {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}