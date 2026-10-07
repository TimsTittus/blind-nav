import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavigationInstruction } from "./navigation-instruction";
import { SafetyIndicator } from "./safety-indicator";
import { SessionControls } from "./session-controls";
import { STATUS_CATEGORIES } from "./status";

describe("SafetyIndicator", () => {
  it.each(STATUS_CATEGORIES)(
    "shows %s as text, not colour alone",
    (category) => {
      render(<SafetyIndicator category={category} />);
      expect(screen.getByText(category)).toBeInTheDocument();
      expect(screen.getByText("Safety status:")).toBeInTheDocument();
    },
  );

  it("does not imply safety for UNKNOWN", () => {
    render(<SafetyIndicator category="UNKNOWN" />);
    expect(screen.queryByText("SAFE")).not.toBeInTheDocument();
    expect(screen.getByText("Path not confirmed")).toBeInTheDocument();
  });
});

describe("NavigationInstruction", () => {
  it("routes CRITICAL text to the assertive region only", () => {
    render(
      <NavigationInstruction
        announcement={{
          text: "STOP. Obstacle directly ahead.",
          priority: "CRITICAL",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "STOP. Obstacle directly ahead.",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it.each(["NAVIGATION", "NORMAL"] as const)(
    "routes %s text to the polite region only",
    (priority) => {
      render(
        <NavigationInstruction
          announcement={{ text: "Path clear.", priority }}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent("Path clear.");
      expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    },
  );

  it("labels the priority visibly", () => {
    render(
      <NavigationInstruction
        announcement={{ text: "Obstacle ahead. Move left.", priority: "HIGH" }}
      />,
    );
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });
});

describe("SessionControls", () => {
  function setup(overrides = {}) {
    const props = {
      voiceEnabled: true,
      paused: false,
      onToggleVoice: vi.fn(),
      onTogglePause: vi.fn(),
      onStop: vi.fn(),
      ...overrides,
    };
    render(<SessionControls {...props} />);
    return props;
  }

  it("exposes labelled, keyboard-operable controls with pressed state", async () => {
    const props = setup();
    const group = screen.getByRole("group", { name: "Session controls" });
    const voice = within(group).getByRole("button", { name: "Voice guidance" });
    expect(voice).toHaveAttribute("aria-pressed", "true");
    expect(
      within(group).getByRole("button", { name: "Pause guidance" }),
    ).toHaveAttribute("aria-pressed", "false");

    const user = userEvent.setup();
    await user.tab();
    expect(voice).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onToggleVoice).toHaveBeenCalledOnce();
    await user.tab();
    await user.keyboard(" ");
    expect(props.onTogglePause).toHaveBeenCalledOnce();
  });

  it("calls onStop from the STOP button", async () => {
    const props = setup();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Stop session" }));
    expect(props.onStop).toHaveBeenCalledOnce();
  });
});
