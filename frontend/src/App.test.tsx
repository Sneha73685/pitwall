import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as client from "./api/client";

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "listSessions").mockResolvedValue([]);
  });

  it("renders the disclaimer", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText(/not affiliated with formula 1/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });

  it("reports the backend as online when the health check succeeds", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });

  it("reports the backend as offline when the health check fails", async () => {
    vi.spyOn(client, "getHealth").mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("offline"));
  });

  it("shows no session selected on the root route", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("selected-session")).toHaveTextContent("none");
    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });
});
