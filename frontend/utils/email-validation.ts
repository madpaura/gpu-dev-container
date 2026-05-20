import emailDomainsConfig from '../config/email-domains.json';

export interface EmailDomainConfig {
  allowedDomains: string[];
  validationEnabled: boolean;
  errorMessage: string;
  allowedDomainsDisplay: string;
}

/**
 * Load email domain configuration from config file
 */
export function getEmailDomainConfig(): EmailDomainConfig {
  return emailDomainsConfig as EmailDomainConfig;
}

/**
 * Validate email domain against allowed domains
 */
export function validateEmailDomain(email: string): { isValid: boolean; error?: string } {
  const config = getEmailDomainConfig();
  
  // If validation is disabled, allow all emails
  if (!config.validationEnabled) {
    return { isValid: true };
  }
  
  // Extract domain from email
  const emailParts = email.toLowerCase().split('@');
  if (emailParts.length !== 2) {
    return { isValid: false, error: 'Invalid email format' };
  }
  
  const domain = emailParts[1];
  
  // Check if domain is in allowed list
  const isAllowed = config.allowedDomains.some(allowedDomain => 
    domain === allowedDomain.toLowerCase()
  );
  
  if (!isAllowed) {
    return { 
      isValid: false, 
      error: `${config.errorMessage}. eg: ${config.allowedDomainsDisplay}` 
    };
  }
  
  return { isValid: true };
}

/**
 * Get list of allowed domains for display
 */
export function getAllowedDomains(): string[] {
  const config = getEmailDomainConfig();
  return config.allowedDomains;
}

/**
 * Check if email domain validation is enabled
 */
export function isEmailValidationEnabled(): boolean {
  const config = getEmailDomainConfig();
  return config.validationEnabled;
}
