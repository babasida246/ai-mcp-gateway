/**
 * Security Policy Enforcer - Content scanning and sanitization
 */

import type { PolicyResult, PolicyViolation, ProjectConfig } from '../types/tracing.js';

export class PolicyEnforcer {
    // Default secret patterns (regex)
    private static readonly DEFAULT_SECRET_PATTERNS = [
        /sk-[a-zA-Z0-9]{32,}/g, // OpenAI API keys
        /ghp_[a-zA-Z0-9]{36}/g, // GitHub tokens
        /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth
        /glpat-[a-zA-Z0-9_-]{20}/g, // GitLab tokens
        /AKIA[0-9A-Z]{16}/g, // AWS access keys
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN-like patterns
        /-----BEGIN [A-Z ]+-----[\s\S]+-----END [A-Z ]+-----/g, // Private keys
    ];

    // Default blocked keywords
    private static readonly DEFAULT_BLOCKED_KEYWORDS = [
        'DROP TABLE',
        'DELETE FROM',
        'TRUNCATE',
        'rm -rf /',
        'sudo rm',
        'format C:',
    ];

    constructor(private projectConfig?: ProjectConfig) { }

    /**
     * Scan prompt for security violations
     */
    scanPrompt(content: string): PolicyResult {
        if (!this.projectConfig?.security?.scanPrompts) {
            return { allowed: true, violations: [] };
        }

        const violations: PolicyViolation[] = [];

        // Check for secrets
        if (this.projectConfig.security.scanPrompts) {
            violations.push(...this.detectSecrets(content));
        }

        // Check for blocked keywords
        violations.push(...this.detectBlockedKeywords(content));

        // Determine if request should be blocked
        const hasHighSeverity = violations.some((v) => v.severity === 'high');

        return {
            allowed: !hasHighSeverity,
            violations,
            sanitizedContent: this.projectConfig.security.redactSecrets
                ? this.redactSecrets(content)
                : undefined,
        };
    }

    /**
     * Scan LLM output for security violations
     */
    scanOutput(content: string): PolicyResult {
        if (!this.projectConfig?.security?.scanOutputs) {
            return { allowed: true, violations: [] };
        }

        const violations: PolicyViolation[] = [];

        // Check for secrets in output
        violations.push(...this.detectSecrets(content));

        // Check for unsafe commands
        violations.push(...this.detectUnsafeCommands(content));

        return {
            allowed: true, // Don't block outputs, just flag
            violations,
            sanitizedContent: this.projectConfig.security.redactSecrets
                ? this.redactSecrets(content)
                : undefined,
        };
    }

    /**
     * Detect secrets using regex patterns
     */
    private detectSecrets(content: string): PolicyViolation[] {
        const violations: PolicyViolation[] = [];
        const patterns =
            this.projectConfig?.security?.secretPatterns?.map((p) => new RegExp(p, 'g')) ??
            PolicyEnforcer.DEFAULT_SECRET_PATTERNS;

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                violations.push({
                    type: 'secret_detected',
                    pattern: pattern.source,
                    position: {
                        start: match.index,
                        end: match.index + match[0].length,
                    },
                    severity: 'high',
                    suggestion: 'Remove or redact sensitive information',
                });
            }
        }

        return violations;
    }

    /**
     * Detect blocked keywords
     */
    private detectBlockedKeywords(content: string): PolicyViolation[] {
        const violations: PolicyViolation[] = [];
        const keywords =
            this.projectConfig?.security?.blockedKeywords ??
            PolicyEnforcer.DEFAULT_BLOCKED_KEYWORDS;

        const lowerContent = content.toLowerCase();

        for (const keyword of keywords) {
            const lowerKeyword = keyword.toLowerCase();
            let index = lowerContent.indexOf(lowerKeyword);

            while (index !== -1) {
                violations.push({
                    type: 'blocked_keyword',
                    pattern: keyword,
                    position: {
                        start: index,
                        end: index + keyword.length,
                    },
                    severity: 'high',
                    suggestion: `Blocked keyword "${keyword}" detected`,
                });

                index = lowerContent.indexOf(lowerKeyword, index + 1);
            }
        }

        return violations;
    }

    /**
     * Detect unsafe shell commands
     */
    private detectUnsafeCommands(content: string): PolicyViolation[] {
        const violations: PolicyViolation[] = [];

        const unsafeCommands = [
            'rm -rf /',
            'sudo rm',
            'format C:',
            'del /F /S /Q',
            'dd if=/dev/zero',
            ':(){ :|:& };:', // Fork bomb
        ];

        for (const cmd of unsafeCommands) {
            const index = content.indexOf(cmd);
            if (index !== -1) {
                violations.push({
                    type: 'unsafe_command',
                    pattern: cmd,
                    position: {
                        start: index,
                        end: index + cmd.length,
                    },
                    severity: 'high',
                    suggestion: `Potentially dangerous command: ${cmd}`,
                });
            }
        }

        return violations;
    }

    /**
     * Redact secrets from content
     */
    private redactSecrets(content: string): string {
        let sanitized = content;
        const patterns =
            this.projectConfig?.security?.secretPatterns?.map((p) => new RegExp(p, 'g')) ??
            PolicyEnforcer.DEFAULT_SECRET_PATTERNS;

        for (const pattern of patterns) {
            sanitized = sanitized.replace(pattern, (match) => {
                const visible = Math.min(4, Math.floor(match.length / 4));
                const redacted = '*'.repeat(match.length - visible);
                return match.substring(0, visible) + redacted;
            });
        }

        return sanitized;
    }

    /**
     * Get policy configuration
     */
    getConfig(): ProjectConfig['security'] | undefined {
        return this.projectConfig?.security;
    }

    /**
     * Update policy configuration
     */
    updateConfig(security: ProjectConfig['security']): void {
        if (!this.projectConfig) {
            this.projectConfig = { security };
        } else {
            this.projectConfig.security = security;
        }
    }
}
