class AESCipher {
  constructor(key) {
    this.key = key;
  }

  async decrypt(encrypt) {
    const encryptBuffer = Uint8Array.from(atob(encrypt), (c) =>
      c.charCodeAt(0)
    );
    const iv = encryptBuffer.slice(0, 16);
    const data = encryptBuffer.slice(16);

    const keyBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(this.key)
    );
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      "AES-CBC",
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      data
    );

    return new TextDecoder().decode(decryptedBuffer);
  }
}

export { AESCipher };
