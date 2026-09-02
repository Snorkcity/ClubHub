const encode = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const decode = (value) => {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

async function generate() {
  const status = document.querySelector("#status");
  status.textContent = "Generating securely…";
  try {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const x = decode(publicJwk.x);
    const y = decode(publicJwk.y);
    const publicKey = new Uint8Array(65);
    publicKey[0] = 4;
    publicKey.set(x, 1);
    publicKey.set(y, 33);
    document.querySelector("#publicKey").value = encode(publicKey);
    document.querySelector("#privateKey").value = privateJwk.d;
    status.textContent = "Key pair ready.";
  } catch {
    status.textContent =
      "This browser could not generate the keys. Try current Safari, Chrome, or Edge.";
  }
}

document.querySelector("#regenerate").addEventListener("click", generate);
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const input = document.querySelector(`#${button.dataset.copy}`);
    await navigator.clipboard.writeText(input.value);
    document.querySelector("#status").textContent = `${input.id} copied.`;
  });
});
generate();