import chalk from 'chalk';
import * as readline from 'readline';

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

/**
 * Prompt user for escalation confirmation
 */
export async function promptEscalationConfirm(
    currentLayer: string,
    suggestedLayer: string,
    reason: string
): Promise<boolean> {
    console.log(chalk.yellow('\n⚠️  Escalation Required'));
    console.log(chalk.dim(`   Current Layer: ${currentLayer}`));
    console.log(chalk.dim(`   Suggested Layer: ${suggestedLayer}`));
    console.log(chalk.dim(`   Reason: ${reason}`));
    console.log(chalk.yellow(`   Note: ${suggestedLayer} is a paid tier and will incur costs.`));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(chalk.cyan('\nProceed with escalation? (y/n): '), (answer) => {
            rl.close();
            const confirmed = answer.trim().toLowerCase() === 'y';
            if (!confirmed) {
                console.log(chalk.yellow('⚠️  Escalation cancelled, using current layer result'));
            }
            resolve(confirmed);
        });
    });
}
