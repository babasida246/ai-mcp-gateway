export async function confirmPrompt(message: string, defaultYes = false, force = false): Promise<boolean> {
    // If force, return defaultYes
    if (force) return defaultYes;

    try {
        const rl = await import('readline');
        return await new Promise<boolean>((resolve) => {
            const r = rl.createInterface({ input: process.stdin, output: process.stdout });
            const hint = defaultYes ? '(Y/n)' : '(y/N)';
            r.question(`${message} ${hint}: `, (answer: string) => {
                r.close();
                const a = answer.trim().toLowerCase();
                if (!a) return resolve(defaultYes);
                resolve(a === 'y' || a === 'yes');
            });
        });
    } catch {
        return defaultYes;
    }
}
