import { ConfidentialClientApplication, CryptoProvider } from "@azure/msal-node";

let client: ConfidentialClientApplication | null = null;
export function msal() {
  const { AZURE_AD_TENANT_ID: tenant, AZURE_AD_CLIENT_ID: clientId, AZURE_AD_CLIENT_SECRET: clientSecret } = process.env;
  if (!tenant || !clientId || !clientSecret) throw new Error("Microsoft Entra ID is not configured.");
  return (client ??= new ConfidentialClientApplication({ auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenant}` } }));
}
export const redirectUri = () => `${process.env.APP_URL || "http://localhost:3000"}/api/auth/callback`;
export const scopes = ["openid", "profile", "email", "User.Read"];
export const crypto = () => new CryptoProvider();
