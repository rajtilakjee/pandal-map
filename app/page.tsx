"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type LocationMode = "manual" | "live";

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
    useState<SubmissionState>("ready");

  const [locationMode, setLocationMode] =
    useState<LocationMode>("manual");

  const [location, setLocation] =
    useState<LocationData | null>(null);

  const [pujaName, setPujaName] =
    useState("");

  const [locationAddress, setLocationAddress] =
    useState("");

  const [area, setArea] =
    useState("");

  const [nearestLandmark, setNearestLandmark] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  /*
   * Switch between manual location and live location.
   */
  const handleLocationModeChange = (
    mode: LocationMode
  ) => {
    setLocationMode(mode);
    setErrorMessage("");

    if (mode === "manual") {
      /*
       * Clear GPS data when switching back
       * to manual location.
       */
      setLocation(null);
      setState("ready");
      return;
    }

    /*
     * Request location only after the user
     * explicitly chooses live location.
     */
    getLiveLocation();
  };

  /*
   * Get the user's live location.
   */
  const getLiveLocation = () => {
    setState("locating");
    setErrorMessage("");

    if (!navigator.geolocation) {
      setLocationMode("manual");
      setState("ready");

      setErrorMessage(
        "Your browser does not support location services. You can enter the location manually instead."
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const locationData: LocationData = {
          latitude:
            position.coords.latitude,

          longitude:
            position.coords.longitude,

          accuracy:
            position.coords.accuracy,
        };

        setLocation(locationData);
        setState("ready");
        setErrorMessage("");
      },

      (error) => {
        console.error(
          "Location error:",
          error
        );

        /*
         * Fall back to manual location if
         * the user doesn't provide GPS access.
         */
        setLocationMode("manual");
        setLocation(null);
        setState("ready");

        switch (error.code) {
          case error.PERMISSION_DENIED:
            setErrorMessage(
              "Location permission was denied. You can enter the location manually instead."
            );
            break;

          case error.POSITION_UNAVAILABLE:
            setErrorMessage(
              "Your location could not be determined. You can enter the location manually instead."
            );
            break;

          case error.TIMEOUT:
            setErrorMessage(
              "Location lookup took too long. You can enter the location manually instead."
            );
            break;

          default:
            setErrorMessage(
              "Unable to get your location. You can enter the location manually instead."
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

  /*
   * Submit the Pandal.
   */
  const submitPandal = async () => {
    setErrorMessage("");
    setMessage("");

    const trimmedName =
      pujaName.trim();

    const trimmedAddress =
      locationAddress.trim();

    const trimmedArea =
      area.trim();

    const trimmedLandmark =
      nearestLandmark.trim();

    /*
     * Validate Pandal name.
     */
    if (!trimmedName) {
      setErrorMessage(
        "Please enter the Pandal name."
      );

      return;
    }

    if (trimmedName.length > 200) {
      setErrorMessage(
        "The Pandal name must be 200 characters or fewer."
      );

      return;
    }

    /*
     * Validate location.
     */
    if (locationMode === "live") {
      if (!location) {
        setErrorMessage(
          "Please wait for your live location to be detected."
        );

        return;
      }
    } else {
      if (!trimmedAddress) {
        setErrorMessage(
          "Please enter the location or address."
        );

        return;
      }

      if (!trimmedArea) {
        setErrorMessage(
          "Please enter the area."
        );

        return;
      }

      if (trimmedAddress.length > 500) {
        setErrorMessage(
          "The location or address must be 500 characters or fewer."
        );

        return;
      }

      if (trimmedArea.length > 100) {
        setErrorMessage(
          "The area must be 100 characters or fewer."
        );

        return;
      }
    }

    /*
     * Validate optional landmark.
     */
    if (trimmedLandmark.length > 200) {
      setErrorMessage(
        "The nearest landmark must be 200 characters or fewer."
      );

      return;
    }

    setState("submitting");

    try {
      const submission = {
        puja_name: trimmedName,

        /*
         * Live GPS data.
         *
         * Manual submissions receive null.
         */
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

        /*
         * Manual location data.
         *
         * Live submissions receive null.
         */
        location_address:
          locationMode === "manual"
            ? trimmedAddress
            : null,

        area:
          trimmedArea || null,

        nearest_landmark:
          trimmedLandmark || null,

        year:
          new Date().getFullYear(),
      };

      const { error } =
        await supabase
          .from("pandal_submissions")
          .insert(submission);

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

        /*
         * Rate limit response.
         */
        if (isRateLimitError(error)) {
          setState("error");

          setErrorMessage(
            "You've submitted several Pandals recently. Please try again later."
          );

          return;
        }

        setState("error");

        setErrorMessage(
          getErrorMessage(error)
        );

        return;
      }

      /*
       * Successful submission.
       */
      setState("success");

      setMessage(
        "Your Pandal has been added. Thank you for contributing!"
      );

      /*
       * Clear the form.
       */
      setPujaName("");
      setLocationAddress("");
      setArea("");
      setNearestLandmark("");
      setLocation(null);

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

  /*
   * Reset the form.
   */
  const reset = () => {
    setState("ready");
    setLocationMode("manual");
    setLocation(null);
    setPujaName("");
    setLocationAddress("");
    setArea("");
    setNearestLandmark("");
    setMessage("");
    setErrorMessage("");
  };

  const canSubmit =
    pujaName.trim().length > 0 &&
    (locationMode === "live"
      ? location !== null
      : locationAddress.trim().length > 0 &&
        area.trim().length > 0);

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

          {/* SUCCESS */}

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

          {/* ERROR */}

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

          {/* FORM */}

          {state !== "success" &&
            state !== "error" && (

            <div className="form-screen">

              {/* PANDAL NAME */}

              <div className="form-group">

                <label htmlFor="puja-name">
                  Pandal Name
                  <span className="required">
                    *
                  </span>
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

              </div>

              {/* LOCATION */}

              <div className="location-section">

                <label className="section-label">
                  Location
                  <span className="required">
                    *
                  </span>
                </label>

                {/* LIVE LOCATION CHECKBOX */}

                <label
                  className={`live-location-option ${
                    locationMode === "live"
                      ? "active"
                      : ""
                  }`}
                >

                  <input
                    type="checkbox"
                    checked={
                      locationMode === "live"
                    }
                    onChange={(event) => {
                      handleLocationModeChange(
                        event.target.checked
                          ? "live"
                          : "manual"
                      );
                    }}
                  />

                  <span className="custom-checkbox">
                    {locationMode === "live" &&
                      "✓"}
                  </span>

                  <span className="live-location-text">

                    <strong>
                      Add live location
                    </strong>

                    <small>
                      Uses your device&apos;s
                      current location
                    </small>

                  </span>

                </label>

                {/* GETTING LOCATION */}

                {locationMode === "live" &&
                  state === "locating" && (

                  <div className="location-status">

                    <div className="small-spinner" />

                    <span>
                      Getting your location...
                    </span>

                  </div>
                )}

                {/* LOCATION FOUND */}

                {locationMode === "live" &&
                  location &&
                  state !== "locating" && (

                  <div className="location-success">

                    <span>
                      ✓
                    </span>

                    <div>

                      <strong>
                        Live location added
                      </strong>

                      <small>
                        Accuracy: approximately{" "}
                        {Math.round(
                          location.accuracy
                        )}
                        m
                      </small>

                    </div>

                  </div>
                )}

                {/* MANUAL LOCATION */}

                {locationMode === "manual" && (

                  <div className="manual-location">

                    {/* ADDRESS */}

                    <div className="form-group">

                      <label htmlFor="location-address">
                        Location / Address
                        <span className="required">
                          *
                        </span>
                      </label>

                      <textarea
                        id="location-address"
                        value={
                          locationAddress
                        }
                        onChange={(event) => {
                          setLocationAddress(
                            event.target.value
                          );

                          setErrorMessage("");
                        }}
                        placeholder="e.g. 123, Diamond Harbour Road"
                        maxLength={500}
                        rows={3}
                      />

                      <div className="character-count textarea-count">
                        {
                          locationAddress.length
                        }
                        /500
                      </div>

                    </div>

                    {/* AREA */}

                    <div className="form-group">

                      <label htmlFor="area">
                        Area
                        <span className="required">
                          *
                        </span>
                      </label>

                      <input
                        id="area"
                        type="text"
                        value={area}
                        onChange={(event) => {
                          setArea(
                            event.target.value
                          );

                          setErrorMessage("");
                        }}
                        placeholder="e.g. Barisha"
                        maxLength={100}
                        autoComplete="off"
                      />

                    </div>

                  </div>
                )}

              </div>

              {/* NEAREST LANDMARK */}

              <div className="form-group">

                <label htmlFor="landmark">

                  Nearest Landmark

                  <span className="optional">
                    optional
                  </span>

                </label>

                <input
                  id="landmark"
                  type="text"
                  value={nearestLandmark}
                  onChange={(event) => {
                    setNearestLandmark(
                      event.target.value
                    );

                    setErrorMessage("");
                  }}
                  placeholder="e.g. Near Deshapriya Park"
                  maxLength={200}
                  autoComplete="off"
                />

              </div>

              {/* ERROR */}

              {errorMessage && (

                <div className="inline-error">
                  {errorMessage}
                </div>

              )}

              {/* SUBMIT */}

              <button
                className="primary-button"
                onClick={submitPandal}
                disabled={
                  !canSubmit ||
                  state === "submitting"
                }
              >
                {state === "submitting"
                  ? "Adding Pandal..."
                  : "Submit Pandal"}
              </button>

              {/* PRIVACY */}

              <p className="privacy-note">
                Live location is optional.
                You can enter the location
                manually instead.
              </p>

            </div>
          )}

        </section>

        {/* FOOTER */}

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
          max-width: 520px;
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
            0 8px 24px
            rgba(8, 127, 123, 0.2);
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
            0 20px 60px
            rgba(23, 59, 58, 0.08);
        }

        .form-group {
          position: relative;
          margin-bottom: 20px;
        }

        .form-group label,
        .section-label {
          display: block;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 9px;
        }

        .required {
          color: #087f7b;
          margin-left: 3px;
        }

        .optional {
          color: #8a9693;
          font-size: 10px;
          font-weight: 500;
          margin-left: 7px;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd9d5;
          border-radius: 13px;
          background: #fffdf7;
          color: #173b3a;
          font-size: 15px;
          outline: none;
          transition:
            border 0.2s ease,
            box-shadow 0.2s ease;
          font-family: inherit;
        }

        .form-group input {
          padding: 14px 15px;
        }

        .form-group textarea {
          padding: 14px 15px;
          resize: vertical;
          min-height: 85px;
          line-height: 1.5;
        }

        .form-group input::placeholder,
        .form-group textarea::placeholder {
          color: #9aa8a5;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          border-color: #087f7b;
          box-shadow:
            0 0 0 3px
            rgba(8, 127, 123, 0.1);
        }

        .character-count {
          position: absolute;
          right: 12px;
          bottom: 14px;
          color: #91a09d;
          font-size: 10px;
        }

        .textarea-count {
          bottom: 12px;
        }

        .location-section {
          margin-bottom: 20px;
        }

        .live-location-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px;
          border: 1px solid #cbd9d5;
          border-radius: 14px;
          cursor: pointer;
          transition:
            border 0.2s ease,
            background 0.2s ease;
          margin-bottom: 14px;
        }

        .live-location-option:hover {
          border-color: #087f7b;
        }

        .live-location-option.active {
          background: #d9efec;
          border-color: #087f7b;
        }

        .live-location-option input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }

        .custom-checkbox {
          width: 21px;
          height: 21px;
          border: 2px solid #9bbdb9;
          border-radius: 6px;
          background: #fffdf7;
          color: #fffdf7;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 13px;
          font-weight: 800;
        }

        .live-location-option.active
          .custom-checkbox {
          background: #087f7b;
          border-color: #087f7b;
        }

        .live-location-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .live-location-text strong {
          font-size: 14px;
        }

        .live-location-text small {
          color: #667674;
          font-size: 11px;
        }

        .manual-location {
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .location-status {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px;
          border-radius: 13px;
          background: #f0f7f5;
          color: #4e6967;
          font-size: 13px;
          margin-bottom: 14px;
        }

        .small-spinner {
          width: 17px;
          height: 17px;
          border: 2px solid #b8ded9;
          border-top-color: #087f7b;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .location-success {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 14px;
          border-radius: 13px;
          background: #d9efec;
          color: #075e5b;
          margin-bottom: 14px;
        }

        .location-success > span {
          width: 27px;
          height: 27px;
          border-radius: 50%;
          background: #087f7b;
          color: #fffdf7;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
        }

        .location-success div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .location-success small {
          color: #4e6967;
          font-size: 11px;
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
            0 8px 20px
            rgba(8, 127, 123, 0.18);
        }

        .primary-button:hover:not(:disabled) {
          background: #075e5b;
          transform: translateY(-1px);
          box-shadow:
            0 10px 24px
            rgba(8, 127, 123, 0.24);
        }

        .primary-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .primary-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }

        .inline-error {
          background: #f9ead1;
          border: 1px solid #ead2a5;
          color: #765f2b;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 13px;
          line-height: 1.45;
          margin-bottom: 14px;
        }

        .privacy-note {
          text-align: center;
          font-size: 11px;
          color: #8a9693;
          line-height: 1.5;
          margin: 14px 0 0;
        }

        .success-screen,
        .error-screen {
          text-align: center;
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
            0 10px 25px
            rgba(8, 127, 123, 0.2);
        }

        .success-label {
          color: #087f7b;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          margin-bottom: 9px;
        }

        .success-screen h2,
        .error-screen h2 {
          margin: 0 0 10px;
          font-size: 24px;
        }

        .success-screen p,
        .error-screen p {
          color: #667674;
          font-size: 14px;
          line-height: 1.6;
          margin: 0 auto 24px;
          max-width: 370px;
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
            padding-top: 35px;
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

        }

      `}</style>

    </main>
  );
}