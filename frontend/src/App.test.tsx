import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";
import * as client from "./api/client";

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the disclaimer", () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });

    render(<App />);

    expect(screen.getByText(/not affiliated with formula 1/i)).toBeInTheDocument();
  });

  it("reports the backend as online when the health check succeeds", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });

  it("reports the backend as offline when the health check fails", async () => {
    vi.spyOn(client, "getHealth").mockRejectedValue(new Error("network error"));

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("offline"));
  });
});
