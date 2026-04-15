// services/scanService.js — Pandora core detection engine
// ============================================================
// Findings are bucketed into 14 categories:
//
//   1. Authentication Secrets         (CRITICAL)
//   2. API Keys & Access Keys         (CRITICAL)
//   3. Cryptographic Keys             (CRITICAL)
//   4. Source Code Secrets            (Common in GitHub)
//   5. Financial & Payment Data
//   6. Direct Identifiers (PII)
//   7. Indirect Identifiers (Quasi-identifiers)
//   8. Sensitive Personal Data
//   9. Health & Medical Data
//  10. Online Identifiers (Digital PII)
//  11. Communication Data
//  12. User Behavioral / Tracking Data
//  13. Internal System Information
//  14. Misconfigured Exposure         (VERY IMPORTANT)
// ============================================================

const CATEGORIES = {
  auth_secrets: {
    id: "auth_secrets",
    label: "Authentication Secrets",
    flag: "CRITICAL",
    tagline: "Passwords and credentials that grant access right now.",
  },
  api_keys: {
    id: "api_keys",
    label: "API Keys & Access Keys",
    flag: "CRITICAL",
    tagline: "Vendor-issued keys (AWS, OpenAI, Stripe, GitHub, Slack…).",
  },
  crypto_keys: {
    id: "crypto_keys",
    label: "Cryptographic Keys",
    flag: "CRITICAL",
    tagline: "Private keys, signing material, certificates.",
  },
  source_secrets: {
    id: "source_secrets",
    label: "Source Code Secrets",
    flag: "COMMON IN GITHUB",
    tagline: "Config, env files, build secrets, debug toggles.",
  },
  financial: {
    id: "financial",
    label: "Financial & Payment Data",
    flag: "HIGH",
    tagline: "Card numbers, IBAN, routing, SWIFT, CVV.",
  },
  direct_id: {
    id: "direct_id",
    label: "Direct Identifiers (PII)",
    flag: "HIGH",
    tagline: "SSN, passport, driver's license, full names.",
  },
  indirect_id: {
    id: "indirect_id",
    label: "Indirect Identifiers (Quasi-identifiers)",
    flag: "MEDIUM",
    tagline: "DOB, ZIP, gender, age — re-identification risk.",
  },
  sensitive: {
    id: "sensitive",
    label: "Sensitive Personal Data",
    flag: "HIGH",
    tagline: "GDPR Art. 9 — religion, orientation, race, biometrics, politics.",
  },
  health: {
    id: "health",
    label: "Health & Medical Data",
    flag: "HIGH",
    tagline: "HIPAA / PHI — diagnoses, prescriptions, medical IDs.",
  },
  online_id: {
    id: "online_id",
    label: "Online Identifiers (Digital PII)",
    flag: "MEDIUM",
    tagline: "IP, MAC, UUID, cookie and session IDs.",
  },
  communication: {
    id: "communication",
    label: "Communication Data",
    flag: "MEDIUM",
    tagline: "Emails, phone numbers, messaging handles.",
  },
  behavioral: {
    id: "behavioral",
    label: "User Behavioral / Tracking Data",
    flag: "LOW",
    tagline: "Geo, search, browsing, purchase and UA strings.",
  },
  internal_info: {
    id: "internal_info",
    label: "Internal System Information",
    flag: "MEDIUM",
    tagline: "Private hostnames, internal IPs, stack traces, paths.",
  },
  misconfig: {
    id: "misconfig",
    label: "Misconfigured Exposure",
    flag: "VERY IMPORTANT",
    tagline: "Open S3, debug=true, CORS *, exposed .git, default creds.",
  },
};

/**
 * Detection rules. Each rule: id, category, type, regex, severity, message.
 * severity: "critical" | "high" | "medium" | "low"
 */
const RULES = [
  // ===== 1. Authentication Secrets =====
  { id:"hardcoded_password", category:"auth_secrets", type:"Hardcoded Password",
    regex:/\b(pass(word|wd)?|pwd)\s*[:=]\s*["'`]([^"'`\n]{1,64})["'`]/gi,
    severity:"critical",
    message:"Password written directly into source." },
  { id:"weak_password", category:"auth_secrets", type:"Weak / Common Password",
    regex:/["'`](password|passw0rd|123456|123456789|qwerty|admin|letmein|welcome|iloveyou|P@ssw0rd)["'`]/gi,
    severity:"critical",
    message:"Weak / common password literal." },
  { id:"basic_auth_url", category:"auth_secrets", type:"Basic Auth in URL",
    regex:/\b(?:https?|ftp|ssh):\/\/[A-Za-z0-9._-]+:[^@\s"'`]+@[A-Za-z0-9.-]+/g,
    severity:"critical",
    message:"Username:password embedded in a URL." },
  { id:"bearer_token", category:"auth_secrets", type:"Bearer Token",
    regex:/\bBearer\s+[A-Za-z0-9\-_\.=]{20,}/g,
    severity:"high",
    message:"Bearer token in an Authorization header." },
  { id:"session_id", category:"auth_secrets", type:"Session / Cookie ID",
    regex:/\b(session[_\s-]?id|jsessionid|phpsessid|sess[_\s-]?id)\s*[:=]\s*["'`]?([A-Za-z0-9_\-]{12,})["'`]?/gi,
    severity:"high",
    message:"Session cookie / ID exposed." },

  // ===== 2. API Keys & Access Keys =====
  { id:"openai_key", category:"api_keys", type:"OpenAI API Key",
    regex:/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g,
    severity:"critical",
    message:"OpenAI-style API key (sk-...)." },
  { id:"aws_access_key", category:"api_keys", type:"AWS Access Key ID",
    regex:/\bAKIA[0-9A-Z]{16}\b/g,
    severity:"critical",
    message:"AWS Access Key ID." },
  { id:"aws_secret_key", category:"api_keys", type:"AWS Secret Access Key",
    regex:/\b(aws[_\-]?secret[_\-]?access[_\-]?key)\s*[:=]\s*["'`]([A-Za-z0-9\/+=]{40})["'`]/gi,
    severity:"critical",
    message:"AWS Secret Access Key." },
  { id:"gcp_key", category:"api_keys", type:"Google API / GCP Key",
    regex:/\bAIza[0-9A-Za-z_\-]{35}\b/g,
    severity:"critical",
    message:"Google API / GCP key." },
  { id:"github_token", category:"api_keys", type:"GitHub Token",
    regex:/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
    severity:"critical",
    message:"GitHub personal / OAuth token." },
  { id:"slack_token", category:"api_keys", type:"Slack Token",
    regex:/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    severity:"critical",
    message:"Slack API token." },
  { id:"stripe_key", category:"api_keys", type:"Stripe Key",
    regex:/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/g,
    severity:"critical",
    message:"Stripe API key." },
  { id:"twilio_sid", category:"api_keys", type:"Twilio Account SID",
    regex:/\bAC[a-f0-9]{32}\b/g,
    severity:"high",
    message:"Twilio Account SID." },
  { id:"sendgrid_key", category:"api_keys", type:"SendGrid Key",
    regex:/\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b/g,
    severity:"critical",
    message:"SendGrid API key." },
  { id:"generic_api_key", category:"api_keys", type:"Generic API Key / Token",
    regex:/\b(api[_-]?key|access[_-]?key|secret[_-]?key|auth[_-]?token|client[_-]?secret|token)\s*[:=]\s*["'`]([A-Za-z0-9_\-]{16,})["'`]/gi,
    severity:"critical",
    message:"Hardcoded API key / secret / token." },

  // ===== 3. Cryptographic Keys =====
  { id:"private_key_block", category:"crypto_keys", type:"Private Key (PEM)",
    regex:/-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    severity:"critical",
    message:"PEM-formatted private key block." },
  { id:"ssh_private_key", category:"crypto_keys", type:"SSH Private Key",
    regex:/-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity:"critical",
    message:"OpenSSH private key." },
  { id:"pgp_private_key", category:"crypto_keys", type:"PGP Private Key",
    regex:/-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity:"critical",
    message:"PGP private key block." },
  { id:"jwt_token", category:"crypto_keys", type:"JWT Token",
    regex:/\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
    severity:"high",
    message:"JSON Web Token (JWT)." },
  { id:"jwt_secret", category:"crypto_keys", type:"JWT Signing Secret",
    regex:/\b(jwt[_\-]?secret|jwt[_\-]?signing[_\-]?key)\s*[:=]\s*["'`]([A-Za-z0-9_\-]{8,})["'`]/gi,
    severity:"critical",
    message:"Hardcoded JWT signing secret." },
  { id:"cert_block", category:"crypto_keys", type:"Certificate Block",
    regex:/-----BEGIN (?:CERTIFICATE|CERTIFICATE REQUEST)-----/g,
    severity:"low",
    message:"X.509 certificate block (usually public, but verify context)." },

  // ===== 4. Source Code Secrets (Common in GitHub) =====
  { id:"dotenv_value", category:"source_secrets", type:".env Style Secret",
    regex:/^\s*[A-Z][A-Z0-9_]{2,}_(KEY|TOKEN|SECRET|PASSWORD|PWD)\s*=\s*["'`]?([^\s"'`]{6,})["'`]?/gm,
    severity:"critical",
    message:".env-style secret assignment." },
  { id:"db_connection_string", category:"source_secrets", type:"Database Connection String",
    regex:/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|mssql|jdbc:[a-z]+):\/\/[^\s"'`<>]+/gi,
    severity:"critical",
    message:"Database connection string (may embed credentials)." },
  { id:"config_password_field", category:"source_secrets", type:"Config Password Field",
    regex:/\b(db[_\-]?password|mysql[_\-]?password|postgres[_\-]?password|redis[_\-]?password)\s*[:=]\s*["'`]?([^"'`\n]{3,})["'`]?/gi,
    severity:"critical",
    message:"Database password in config." },
  { id:"debug_flag", category:"source_secrets", type:"Debug Flag Enabled",
    regex:/\b(debug|DEBUG)\s*[:=]\s*(true|True|TRUE|1|"true"|'true')/g,
    severity:"medium",
    message:"Debug flag enabled — avoid shipping to production." },
  { id:"todo_secret", category:"source_secrets", type:"TODO Secret Note",
    regex:/\b(?:TODO|FIXME|HACK)[:\s][^\n]{0,80}(password|secret|key|token)[^\n]*/gi,
    severity:"medium",
    message:"TODO / FIXME comment referencing a secret." },

  // ===== 5. Financial & Payment Data =====
  { id:"credit_card", category:"financial", type:"Credit Card Number",
    regex:/\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{4}){2,3}(?:[ -]?\d{1,4})?\b/g,
    severity:"critical",
    message:"Credit / debit card number." },
  { id:"cvv", category:"financial", type:"CVV / CVC",
    regex:/\b(cvv|cvc|cid)\s*[:=]\s*["'`]?(\d{3,4})["'`]?/gi,
    severity:"critical",
    message:"Card security code (CVV/CVC)." },
  { id:"iban", category:"financial", type:"IBAN",
    regex:/\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,
    severity:"high",
    message:"International Bank Account Number (IBAN)." },
  { id:"routing_number", category:"financial", type:"US Routing Number",
    regex:/\b(routing[_\s-]?number|aba)\s*[:=]\s*["'`]?(\d{9})["'`]?/gi,
    severity:"high",
    message:"US bank routing number." },
  { id:"bank_account", category:"financial", type:"Bank Account Number",
    regex:/\b(account[_\s-]?number|acct[_\s-]?num|bank[_\s-]?account)\s*[:=]\s*["'`]?(\d{6,17})["'`]?/gi,
    severity:"high",
    message:"Bank account number." },
  { id:"swift_bic", category:"financial", type:"SWIFT / BIC",
    regex:/\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
    severity:"medium",
    message:"SWIFT / BIC code (verify context)." },

  // ===== 6. Direct Identifiers (PII) =====
  { id:"ssn_us", category:"direct_id", type:"US Social Security Number",
    regex:/\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    severity:"critical",
    message:"US Social Security Number." },
  { id:"passport", category:"direct_id", type:"Passport Number",
    regex:/\bpassport\s*(?:no\.?|number|#)?\s*[:=]?\s*([A-Z]?\d{6,9})\b/gi,
    severity:"high",
    message:"Passport number." },
  { id:"drivers_license", category:"direct_id", type:"Driver's License",
    regex:/\b(?:driver'?s?\s*(?:license|licence)|DL|DLN)\s*[:#=]?\s*([A-Z0-9]{6,15})\b/gi,
    severity:"high",
    message:"Driver's license number." },
  { id:"national_id", category:"direct_id", type:"National ID",
    regex:/\b(national[_\s-]?id|aadhaar|nric|pan[_\s-]?number|nin)\s*[:=]\s*["'`]?([A-Z0-9]{6,16})["'`]?/gi,
    severity:"high",
    message:"National identification number." },
  { id:"full_name_labeled", category:"direct_id", type:"Full Name (labeled)",
    regex:/\b(?:full[_\s-]?name|customer[_\s-]?name|first[_\s-]?name|last[_\s-]?name)\s*[:=]\s*["'`]([^"'`\n]{2,64})["'`]/gi,
    severity:"medium",
    message:"Personal name in a labeled field." },

  // ===== 7. Indirect Identifiers (Quasi-identifiers) =====
  { id:"dob", category:"indirect_id", type:"Date of Birth",
    regex:/\b(?:dob|date[_\s-]?of[_\s-]?birth|birth[_\s-]?date|birthday)\s*[:=]?\s*["'`]?(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})["'`]?/gi,
    severity:"medium",
    message:"Date of birth." },
  { id:"zip_code", category:"indirect_id", type:"Postal / ZIP Code",
    regex:/\b(?:zip(?:code)?|postal[_\s-]?code|post[_\s-]?code)\s*[:=]\s*["'`]?(\d{5}(?:-\d{4})?|[A-Z]\d[A-Z]\s?\d[A-Z]\d)["'`]?/gi,
    severity:"low",
    message:"Postal / ZIP code in labeled field." },
  { id:"age", category:"indirect_id", type:"Age",
    regex:/\bage\s*[:=]\s*["'`]?(\d{1,3})["'`]?/gi,
    severity:"low",
    message:"Age in a labeled field." },
  { id:"gender", category:"indirect_id", type:"Gender",
    regex:/\bgender\s*[:=]\s*["'`]?(male|female|non[\s-]?binary|m|f|nb|other)["'`]?/gi,
    severity:"low",
    message:"Gender in a labeled field." },
  { id:"marital_status", category:"indirect_id", type:"Marital Status",
    regex:/\bmarital[_\s-]?status\s*[:=]\s*["'`]?(single|married|divorced|widowed|separated)["'`]?/gi,
    severity:"low",
    message:"Marital status." },

  // ===== 8. Sensitive Personal Data (GDPR Art. 9) =====
  { id:"religion", category:"sensitive", type:"Religion",
    regex:/\breligion\s*[:=]\s*["'`]?([A-Za-z]{3,32})["'`]?/gi,
    severity:"high",
    message:"Religion." },
  { id:"sexual_orientation", category:"sensitive", type:"Sexual Orientation",
    regex:/\b(sexual[_\s-]?orientation|orientation)\s*[:=]\s*["'`]?(straight|heterosexual|gay|lesbian|bisexual|bi|pansexual|asexual|queer|lgbtq\+?)["'`]?/gi,
    severity:"high",
    message:"Sexual orientation." },
  { id:"ethnicity", category:"sensitive", type:"Ethnicity / Race",
    regex:/\b(ethnicity|race|nationality)\s*[:=]\s*["'`]?([A-Za-z\s]{2,32})["'`]?/gi,
    severity:"high",
    message:"Ethnicity / race / nationality." },
  { id:"political", category:"sensitive", type:"Political Affiliation",
    regex:/\b(political[_\s-]?party|political[_\s-]?affiliation|union[_\s-]?membership)\s*[:=]\s*["'`]?([^"'`\n]{2,64})["'`]?/gi,
    severity:"high",
    message:"Political / union affiliation." },
  { id:"biometric", category:"sensitive", type:"Biometric Identifier",
    regex:/\b(fingerprint|face[_\s-]?id|faceid|retina[_\s-]?scan|iris[_\s-]?scan|voiceprint|biometric[_\s-]?(?:hash|template))\b/gi,
    severity:"high",
    message:"Biometric identifier." },

  // ===== 9. Health & Medical Data (HIPAA / PHI) =====
  { id:"diagnosis", category:"health", type:"Medical Diagnosis",
    regex:/\b(diagnosis|diagnosed\s+with|medical[_\s-]?condition|illness|disease)\s*[:=]?\s*["'`]?([A-Za-z\s]{3,64})["'`]?/gi,
    severity:"high",
    message:"Medical diagnosis / condition." },
  { id:"medication", category:"health", type:"Medication / Prescription",
    regex:/\b(medication|prescription|dosage|Rx)\s*[:=]\s*["'`]?([A-Za-z0-9\s\-]{3,64})["'`]?/gi,
    severity:"high",
    message:"Medication / prescription." },
  { id:"medical_record", category:"health", type:"Medical Record Number",
    regex:/\b(MRN|medical[_\s-]?record[_\s-]?number|patient[_\s-]?id)\s*[:#=]?\s*["'`]?([A-Z0-9]{4,15})["'`]?/gi,
    severity:"high",
    message:"Medical record / patient identifier." },
  { id:"health_keyword", category:"health", type:"Health Keyword",
    regex:/\b(HIV|AIDS|cancer|diabetes|hypertension|depression|bipolar|schizophrenia|pregnancy|pregnant|HBV|HCV|tuberculosis|chemotherapy|insulin)\b/gi,
    severity:"high",
    message:"Health-related keyword in free text." },

  // ===== 10. Online Identifiers (Digital PII) =====
  { id:"ipv4_public", category:"online_id", type:"IPv4 Address",
    regex:/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g,
    severity:"medium",
    message:"IPv4 address." },
  { id:"ipv6", category:"online_id", type:"IPv6 Address",
    regex:/\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g,
    severity:"medium",
    message:"IPv6 address." },
  { id:"mac_address", category:"online_id", type:"MAC Address",
    regex:/\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    severity:"medium",
    message:"MAC address." },
  { id:"uuid", category:"online_id", type:"UUID / Device ID",
    regex:/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/g,
    severity:"low",
    message:"UUID / device identifier." },
  { id:"imei", category:"online_id", type:"IMEI",
    regex:/\bIMEI\s*[:#=]?\s*(\d{15})\b/gi,
    severity:"high",
    message:"IMEI (device serial)." },
  { id:"advertising_id", category:"online_id", type:"Advertising ID",
    regex:/\b(gaid|idfa|advertising[_\s-]?id|android[_\s-]?id)\s*[:=]\s*["'`]?([A-Za-z0-9\-]{8,})["'`]?/gi,
    severity:"medium",
    message:"Mobile advertising identifier." },

  // ===== 11. Communication Data =====
  { id:"email_address", category:"communication", type:"Email Address",
    regex:/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    severity:"low",
    message:"Email address." },
  { id:"phone_number", category:"communication", type:"Phone Number",
    regex:/\b(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g,
    severity:"medium",
    message:"Phone number." },
  { id:"phone_international", category:"communication", type:"International Phone",
    regex:/\+(?:[0-9]\s?){7,14}[0-9]/g,
    severity:"medium",
    message:"International phone number." },
  { id:"im_handle", category:"communication", type:"Messaging Handle",
    regex:/\b(whatsapp|telegram|signal|discord|wechat|skype)\s*[:=]\s*["'`]?(@?[A-Za-z0-9_\-\.+]{3,32})["'`]?/gi,
    severity:"low",
    message:"Messaging app handle." },

  // ===== 12. User Behavioral / Tracking Data =====
  { id:"geo_coords", category:"behavioral", type:"Geo Coordinates",
    regex:/\b-?([1-8]?\d(?:\.\d+)|90(?:\.0+)?),\s*-?((?:1[0-7]\d|[1-9]?\d)(?:\.\d+)|180(?:\.0+)?)\b/g,
    severity:"medium",
    message:"Latitude/longitude pair." },
  { id:"location_field", category:"behavioral", type:"Location Field",
    regex:/\b(location|gps|coords|geo)\s*[:=]\s*["'`]?([^"'`\n]{3,80})["'`]?/gi,
    severity:"low",
    message:"Location / GPS field." },
  { id:"search_query", category:"behavioral", type:"Search Query",
    regex:/\b(search[_\s-]?query|query|q)\s*[:=]\s*["'`]([^"'`\n]{2,120})["'`]/gi,
    severity:"low",
    message:"Captured search query." },
  { id:"browsing_history", category:"behavioral", type:"Browsing History",
    regex:/\b(browsing[_\s-]?history|visited[_\s-]?urls?|page[_\s-]?views?)\b/gi,
    severity:"low",
    message:"Browsing-history reference." },
  { id:"user_agent", category:"behavioral", type:"User-Agent String",
    regex:/\bMozilla\/5\.0\s*\([^)]{5,200}\)[^"'`\n]{0,200}/g,
    severity:"low",
    message:"Captured User-Agent string." },
  { id:"purchase_history", category:"behavioral", type:"Purchase History",
    regex:/\b(purchase[_\s-]?history|orders?|cart[_\s-]?items?)\s*[:=]/gi,
    severity:"low",
    message:"Purchase / order history field." },

  // ===== 13. Internal System Information =====
  { id:"private_ip", category:"internal_info", type:"Private IP Address",
    regex:/\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g,
    severity:"medium",
    message:"Private / internal IP address." },
  { id:"internal_hostname", category:"internal_info", type:"Internal Hostname",
    regex:/\b[a-z0-9\-]+\.(?:internal|local|corp|lan|intranet)\b/gi,
    severity:"medium",
    message:"Internal hostname." },
  { id:"file_path", category:"internal_info", type:"Absolute File Path",
    regex:/\b(?:\/(?:home|Users|var|etc|opt|root)\/[^\s"'`<>\n]{2,120}|[A-Z]:\\Users\\[^\s"'`<>\n]{2,120})/g,
    severity:"low",
    message:"Absolute file path / user directory." },
  { id:"stack_trace", category:"internal_info", type:"Stack Trace",
    regex:/\bat\s+[A-Za-z_$][\w$.]*\s*\([^)]*:\d+:\d+\)/g,
    severity:"low",
    message:"JavaScript / Java stack-trace frame." },
  { id:"port_open", category:"internal_info", type:"Exposed Port",
    regex:/\blocalhost:(?:3306|5432|27017|6379|9200|11211|8080|8000)\b/g,
    severity:"medium",
    message:"Reference to an exposed internal service port." },

  // ===== 14. Misconfigured Exposure (VERY IMPORTANT) =====
  { id:"cors_wildcard", category:"misconfig", type:"CORS Wildcard",
    regex:/\bAccess-Control-Allow-Origin\s*:\s*\*|cors\s*\(\s*\{\s*origin\s*:\s*["'`]\*["'`]/gi,
    severity:"high",
    message:"CORS configured with '*' — allows any origin." },
  { id:"public_s3", category:"misconfig", type:"Open S3 Bucket URL",
    regex:/\bhttps?:\/\/(?:[a-z0-9-]+\.s3|s3[.-][a-z0-9-]+)\.amazonaws\.com\/[^\s"'`<>]*/gi,
    severity:"high",
    message:"S3 bucket URL — verify it is not public." },
  { id:"exposed_git", category:"misconfig", type:"Exposed .git Folder",
    regex:/\/\.git(?:\/|\b)/g,
    severity:"high",
    message:"Reference to a .git folder served over HTTP." },
  { id:"admin_panel", category:"misconfig", type:"Admin Panel Path",
    regex:/\/(?:admin|wp-admin|phpmyadmin|manager\/html|administrator)(?:\/|\?|$)/g,
    severity:"medium",
    message:"Admin panel path." },
  { id:"default_credentials", category:"misconfig", type:"Default Credentials",
    regex:/\b(admin|root|user|guest)\s*[:=]\s*["'`](admin|root|password|1234|changeme|default)["'`]/gi,
    severity:"critical",
    message:"Default / unchanged credentials." },
  { id:"ssl_disabled", category:"misconfig", type:"SSL Verification Disabled",
    regex:/\b(rejectUnauthorized\s*:\s*false|verify\s*=\s*False|--insecure|CURLOPT_SSL_VERIFYPEER\s*,\s*0)\b/g,
    severity:"high",
    message:"TLS / SSL verification disabled." },
  { id:"auth_disabled", category:"misconfig", type:"Auth Disabled",
    regex:/\b(auth|authentication|require[_\s-]?auth)\s*[:=]\s*(false|False|FALSE|0|"false"|'false')/g,
    severity:"high",
    message:"Authentication disabled in config." },
  { id:"env_production_debug", category:"misconfig", type:"Production Debug Mode",
    regex:/\b(ENV|NODE_ENV|APP_ENV)\s*[:=]\s*["'`]?production["'`]?[\s\S]{0,120}\bdebug\s*[:=]\s*true/gi,
    severity:"high",
    message:"Debug mode enabled in production." },
];

// ============================================================
// Engine
// ============================================================

function maskSensitive(value, severity) {
  if ((severity === "critical" || severity === "high") && value.length > 8) {
    return value.slice(0, 4) + "****" + value.slice(-2);
  }
  return value;
}

function detectIssues(content) {
  const issues = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      issues.push({
        id: rule.id,
        category: rule.category,
        type: rule.type,
        severity: rule.severity,
        message: rule.message,
        match: maskSensitive(match[0], rule.severity),
        index: match.index,
        line: content.slice(0, match.index).split("\n").length,
      });
      if (match.index === re.lastIndex) re.lastIndex++;
    }
  }
  return issues;
}

function computeRiskLevel(issues) {
  if (issues.length === 0) return "none";
  const hasCritical = issues.some((i) => i.severity === "critical");
  const hasHigh = issues.some((i) => i.severity === "high");
  const hasMed = issues.some((i) => i.severity === "medium");
  if (hasCritical) return "high";
  if (hasHigh || issues.length >= 5) return "high";
  if (hasMed || issues.length >= 2) return "medium";
  return "low";
}

const CATEGORY_TIP = {
  auth_secrets:   "Rotate the credential now and move it to a secrets manager.",
  api_keys:       "Revoke the key at the vendor and load the new one from env vars.",
  crypto_keys:    "Treat as compromised; regenerate and distribute via a KMS.",
  source_secrets: "Scrub from git history (git filter-repo / BFG) and rotate.",
  financial:      "Tokenize or truncate; never persist full PAN or CVV.",
  direct_id:      "Redact or tokenize. Apply PCI / PII retention limits.",
  indirect_id:    "Generalize (bucket ages, truncate ZIP) to resist re-identification.",
  sensitive:      "GDPR Art. 9 special category — explicit consent + encryption + access log.",
  health:         "HIPAA / PHI — minimum-necessary access and audit trail required.",
  online_id:      "Hash with a rotating salt and expire aggressively.",
  communication:  "Hash or tokenize; never log in plaintext error messages.",
  behavioral:     "Aggregate or anonymize before analytics; set short retention.",
  internal_info:  "Avoid committing internal topology; strip from public logs.",
  misconfig:      "Fix the configuration immediately and scan CI for regressions.",
};

function buildSuggestion(issues) {
  if (issues.length === 0) return "No obvious secrets or PII detected. Looks clean.";
  const cats = new Set(issues.map((i) => i.category));
  return Array.from(cats).map((c) => CATEGORY_TIP[c]).filter(Boolean).join(" ");
}

function summarize(issues) {
  const byCategory = {};
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const id of Object.keys(CATEGORIES)) byCategory[id] = 0;
  for (const i of issues) {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
  }
  return { total: issues.length, byCategory, bySeverity };
}

/** Public entry point. */
function scanContent(content) {
  const issues = detectIssues(content);
  const risk = computeRiskLevel(issues);
  const summary = summarize(issues);
  return {
    risk,
    summary,
    categories: CATEGORIES,
    issues,
    suggestion: buildSuggestion(issues),
  };
}

module.exports = { scanContent, CATEGORIES, RULES };
