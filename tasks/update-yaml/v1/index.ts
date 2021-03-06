import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
import { parameters } from './interfaces'
import yaml = require('yaml');
import fs = require('fs');

let execOpts: tr.IExecSyncOptions;

async function run() {
    try {
        let parameters: parameters;
        try {
            parameters = {
                filename: tl.getInput('filename', true) || '',
                key: tl.getInput('key', true) || '',
                value: tl.getInput('value', false),
                createBackup: tl.getBoolInput('createBackup', false) || false
            };
            execOpts = {
                silent: tl.getBoolInput('hideSubprocessOutput') || true,
                cwd: tl.getInput('workingDirectory')
            };
            tl.debug(`Parameters: ${JSON.stringify(parameters)}`);
        } catch (err) {
            if (err instanceof Error) {
                tl.setResult(tl.TaskResult.Failed, `Cannot parse parameters: ${err.message}`);
                return;
            } else {
                tl.setResult(tl.TaskResult.Failed, "Cannot parse parameters. Unknown error");
                return;
            }
        }
        updateYamlFile(parameters);
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, `Task run failed: ${err.message}`);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Task run failed. Unknown error");
        }
    }
}

// get latest tag in git repository
async function getLatestTag(): Promise<string | undefined> {
    try {
        if (tl.execSync('git', ['tag'], execOpts).stdout.trim() == "") {
            tl.debug("No tags found");
        } else {
            return (tl.execSync('git', ['describe', '--abbrev=0', '--tags'], execOpts)).stdout.trim();
        }
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, `Get latest tag failed: ${err.message}`);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Get latest tag failed. Unknown error");
        }
    }
}

// update object by defined value with dot notation key
function set(obj:any, key:string, val:string) {
    let path: any = key.split(".");
    while (path.length > 1)
        obj = obj[path.shift()];
    return obj[path.shift()] = val;
}

// update yaml file with new key value pair
async function updateYamlFile(parameters: parameters): Promise<void> {
    try {
        let yamlData = yaml.parse(fs.readFileSync(parameters.filename, 'utf8'));
        if (parameters.value == undefined) {
            const latestTag = await getLatestTag();
            if (latestTag != undefined) {
                tl.debug(`No value provided for key: ${parameters.key}, using latest tag: ${latestTag}`);
                set(yamlData, parameters.key, latestTag)
            } else {
                tl.debug(`No value provided for key: ${parameters.key}, and no tags found`);
                tl.setResult(tl.TaskResult.Failed, `No value provided for key: ${parameters.key}, and no tags found`)
            }
        } else {
            tl.debug(`Updating key: ${parameters.key} with value: ${parameters.value}`);
            set(yamlData, parameters.key, parameters.value)
        }
        const output = new yaml.Document(yamlData);
        console.log(output.toString())
        if (parameters.createBackup) {
            fs.copyFileSync(parameters.filename, `${parameters.filename}.bak`);
        }
        fs.writeFileSync(parameters.filename, String(output));
    } catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, `Update YAML file failed: ${err.message}`);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Update YAML file failed. Unknown error");
        }
    }
}

run();
