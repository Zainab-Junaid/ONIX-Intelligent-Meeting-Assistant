/**
 * Test Runner: All Tests
 * 
 * Run: npx tsx tests/run-all-tests.ts
 * 
 * Executes all test suites in order:
 * 1. Unit tests (no DB required)
 * 2. Integration tests (DB required)
 * 3. E2E tests (DB required)
 */

import { spawn } from 'child_process';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

interface TestResult {
    name: string;
    passed: boolean;
    output: string;
}

async function runTest(testPath: string): Promise<TestResult> {
    return new Promise((resolve) => {
        const fullPath = path.join(ROOT, testPath);
        const proc = spawn('npx', ['tsx', fullPath], {
            cwd: ROOT,
            shell: true,
            env: { ...process.env },
        });

        let output = '';

        proc.stdout.on('data', (data) => {
            output += data.toString();
            process.stdout.write(data);
        });

        proc.stderr.on('data', (data) => {
            output += data.toString();
            process.stderr.write(data);
        });

        proc.on('close', (code) => {
            resolve({
                name: testPath,
                passed: code === 0,
                output,
            });
        });
    });
}

async function main() {
    console.log('\n' + '═'.repeat(70));
    console.log('🧪 RUNNING ALL TESTS');
    console.log('═'.repeat(70) + '\n');

    const results: TestResult[] = [];

    // Unit tests (no DB)
    console.log('\n📋 PHASE 1: Unit Tests (No DB Required)\n' + '-'.repeat(50));
    results.push(await runTest('tests/unit/speakerAnalytics.test.ts'));
    results.push(await runTest('tests/unit/meetingAnalytics.test.ts'));

    // Integration tests (DB required)
    console.log('\n📋 PHASE 2: Integration Tests (DB Required)\n' + '-'.repeat(50));
    console.log('⚠️  Skipping integration tests - requires database connection');
    console.log('   Run individually with: npx tsx tests/integration/<test>.test.ts\n');

    // E2E tests (DB required)
    console.log('📋 PHASE 3: E2E Tests (DB Required)\n' + '-'.repeat(50));
    console.log('⚠️  Skipping E2E tests - requires database connection');
    console.log('   Run individually with: npx tsx tests/e2e/fullPipeline.test.ts\n');

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(70));

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;

    for (const result of results) {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`  ${status} ${result.name}`);
    }

    console.log('\n' + '-'.repeat(70));
    console.log(`Total: ${passedCount} passed, ${failedCount} failed`);
    console.log('═'.repeat(70) + '\n');

    if (failedCount > 0) {
        process.exit(1);
    }
}

main().catch(console.error);
