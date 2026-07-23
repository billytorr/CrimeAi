"use client";

import { createContext, useContext } from "react";

// Lets any component (feed cards, message headers, etc.) open a user's
// profile page. AppShell provides the implementation + renders the overlay.
// Tapping YOUR OWN name/post routes to the You tab (your real profile)
// instead of a separate overlay — one profile, one place. An optional
// postId focuses that exact post there.
export const ProfileCtx = createContext<{ open: (handle: string, postId?: string) => void }>({ open: () => {} });
export const useOpenProfile = () => useContext(ProfileCtx).open;
