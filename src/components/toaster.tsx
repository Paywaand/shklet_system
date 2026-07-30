"use client";

import { Toaster as HotToaster } from "react-hot-toast";
import { useTheme } from "./theme-provider";

export function Toaster() {
  const { theme } = useTheme();
  return (
    <HotToaster
      position="top-center"
      toastOptions={{
        style: {
          background: theme === "dark" ? "#201f24" : "#ffffff",
          color: theme === "dark" ? "#f3efe9" : "#232222",
          border: `1px solid ${theme === "dark" ? "#322f36" : "#e7ddd0"}`,
        },
        success: { iconTheme: { primary: "#249e6b", secondary: "#fff" } },
        error: { iconTheme: { primary: "#ef3340", secondary: "#fff" } },
      }}
    />
  );
}
