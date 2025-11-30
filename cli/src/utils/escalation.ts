import chalk from 'chalk';

/**
 * Display escalation information when MCP needs to call another LLM
 */
export function displayEscalation(escalationData: {
    from: string;
    to: string;
    reason: string;
    cost?: number;
}): void {
    console.log(chalk.cyan('\n🔄 Model Escalation:'));
    console.log(chalk.gray(`   From: ${escalationData.from}`));
    console.log(chalk.gray(`   To: ${escalationData.to}`));
    console.log(chalk.gray(`   Reason: ${escalationData.reason}`));
    if (escalationData.cost) {
        console.log(chalk.gray(`   Additional cost: $${escalationData.cost.toFixed(4)}`));
    }
}
