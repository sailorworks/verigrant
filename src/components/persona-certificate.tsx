// src/components/persona-certificate.tsx

import React from "react";

// This is a React component that will be rendered into an SVG by Satori
export const PersonaCertificate = ({
  username,
  lawfulChaotic,
  goodEvil,
  primaryTrait,
  timestamp,
}: {
  username: string;
  lawfulChaotic: string;
  goodEvil: string;
  primaryTrait: string;
  timestamp: string;
}) => (
  <div
    style={{
      height: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#1a1a1a",
      color: "white",
      fontFamily: '"Inter"',
      padding: "40px",
      border: "2px solid #4a4a4a",
      borderRadius: "10px",
    }}
  >
    <div style={{ fontSize: "48px", fontWeight: "bold", color: "#a855f7" }}>
      Persona Certificate
    </div>
    <div style={{ fontSize: "24px", marginTop: "20px", color: "#d4d4d4" }}>
      This certifies that the holder has recorded their persona on-chain.
    </div>

    {/* --- THIS IS THE NEWLY ADDED LINE --- */}
    <div style={{ marginTop: "30px", fontSize: "18px", color: "#a1a1aa" }}>
      Holder: <span style={{ color: "white" }}>{username}</span>
    </div>

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginTop: "10px",
        fontSize: "20px",
        width: "100%",
        padding: "0 50px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "15px",
        }}
      >
        <span style={{ color: "#8b8b8b" }}>Primary Trait:</span>
        <span style={{ fontWeight: "bold" }}>{primaryTrait}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "15px",
        }}
      >
        <span style={{ color: "#8b8b8b" }}>Lawful / Chaotic Score:</span>
        <span style={{ fontWeight: "bold" }}>{lawfulChaotic}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: "#8b8b8b" }}>Good / Evil Score:</span>
        <span style={{ fontWeight: "bold" }}>{goodEvil}</span>
      </div>
    </div>
    <div style={{ marginTop: "auto", fontSize: "16px", color: "#555" }}>
      Committed on: {timestamp}
    </div>
  </div>
);
