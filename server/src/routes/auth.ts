import { Router } from "express";
import { verifyMessage } from "viem";
import { getOrCreateNonce, verifyNonce } from "../services/storage.js";

const router = Router();

// Get a nonce to sign
router.get("/auth/nonce/:address", (req, res) => {
  const nonce = getOrCreateNonce(req.params.address);
  res.json({ nonce });
});

// Verify signature and return session token (address)
router.post("/auth/verify", async (req, res) => {
  const { address, signature, nonce } = req.body;

  if (!address || !signature || !nonce) {
    res.status(400).json({ error: "address, signature, and nonce required" });
    return;
  }

  if (!verifyNonce(address, nonce)) {
    res.status(401).json({ error: "Invalid or expired nonce" });
    return;
  }

  const message = `Sign in to ArbiBench\n\nNonce: ${nonce}`;

  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    res.json({ address: address.toLowerCase(), authenticated: true });
  } catch {
    res.status(401).json({ error: "Signature verification failed" });
  }
});

export default router;
