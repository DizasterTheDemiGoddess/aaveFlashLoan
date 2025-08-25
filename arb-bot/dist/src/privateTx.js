// Attempts to send a private transaction; falls back to public mempool.
export async function sendPrivateOrPublic(provider, signedTx) {
    try {
        // Some relays support this RPC method; ignore if unsupported.
        const hash = await provider.send("eth_sendPrivateTransaction", [
            { tx: signedTx, preferences: { fast: true } },
        ]);
        return hash;
    }
    catch {
        // fallback to public
        const hash = await provider.send("eth_sendRawTransaction", [signedTx]);
        return hash;
    }
}
