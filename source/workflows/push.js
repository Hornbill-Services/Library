(async () => {
    const version = '1.0';

    const fs = require('node:fs');
    const path = require('node:path');

    console.log('\n==== Hornbill Services Automation ====');
    console.log(`======== Push Workflow/s v${version} ========`);

    const hblib = require('../common/hb-module.js');

    let instance_id = '';
    let api_key = '';
    let app = '';
    let workflow_id = '';
    let workflow_filter = '';
    let workflow_type = '';

    const does_workflow_exist = async (workflow_id) => {
        console.log(`\nChecking if [${workflow_id}] exists on the target instance`);
        const payload = {
            '@service': 'bpm',
            '@method': 'workflowGet',
            params: {
                application: app,
                name: workflow_id,
                version: 0
            }
        }
        const api_response = await hblib.invoke(`${api_endpoint}${payload['@service']}`, api_key, payload);
        return api_response.success;
    };

    const push_workflow = async (update, workflow_definition) => {
        const response = {
            success: false,
            errors: [],
            workflow_uid: null
        };
        let payload;
        if (update) {
            console.log(`Updating [${workflow_definition.name}]`);
            payload = {
                '@service': 'bpm',
                '@method': 'workflowSaveDraft',
                params: {
                    application: app,
                    name: workflow_definition.name,
                    title: workflow_definition.title,
                    description: workflow_definition.description,
                    definition: workflow_definition.definition
                }
            };
        } else {
            console.log(`Creating [${workflow_definition.name}]`);
            payload = {
                '@service': 'bpm',
                '@method': 'workflowAdd',
                params: {
                    application: app,
                    type: workflow_type,
                    name: workflow_definition.name,
                    title: workflow_definition.title,
                    description: workflow_definition.description,
                    owner: workflow_definition.owner,
                    definition: workflow_definition.definition
                }
            }
        }
        
        const api_response = await hblib.invoke(`${api_endpoint}${payload['@service']}`, api_key, payload);
        if (!api_response.success) {
            response.errors = api_response.errors;
        } else {
            response.success = true;
            if (api_response.data?.params?.workflowId) response.workflow_uid = api_response.data.params.workflowId;
        }
        return response;
    };

    const process_args = () => {
        // Process command line args
        for (let x = 0; x < process.argv.length; x++) {
            switch (process.argv[x]) {
                case '-instance':
                    x++;
                    if (x < process.argv.length) instance_id = process.argv[x];
                    break;
                case '-apikey':
                    x++;
                    if (x < process.argv.length) api_key = process.argv[x];
                    break;
                case '-app':
                    x++;
                    if (x < process.argv.length) app = process.argv[x];
                    break;
                case '-id':
                    x++;
                    if (x < process.argv.length) workflow_id = process.argv[x];
                    break;
                case '-filter':
                    x++;
                    if (x < process.argv.length) workflow_filter = process.argv[x];
                    break;
                case '-type':
                    x++;
                    if (x < process.argv.length) workflow_type = process.argv[x];
                    break;
                default:
                    break;
            }
        }

        // Validate args
        if (instance_id === '') {
            console.log('-instance arg is mandatory');
            process.exit(1);
        }
        if (api_key === '') {
            console.log('-apikey arg is mandatory');
            process.exit(1);
        }
        if (app === '') {
            console.log('-app arg is mandatory');
            process.exit(1);
        }
        if (workflow_filter === '' && workflow_id === '') {
            console.log('You must provide a value for either of the -filter or -id args');
            process.exit(1);
        }
        if (workflow_filter !== '' && workflow_id !== '') {
            console.log('You must provide a value for either of the -filter or -id args, and not both');
            process.exit(1);
        }
    };

    // Process CLI arguments
    process_args();

    console.log(`\n- Instance ID: ${instance_id}`);
    console.log(`- Application: ${app}`);
    if (workflow_filter !== '') console.log(`- Workflow Filter: ${workflow_filter}`);
    else console.log(`- Workflow ID: ${workflow_id}`);
    console.log(`- Workflow Type: ${workflow_type}`);

    // Get API endpoint for instance
    const zoneinfo = await hblib.get_endpoints(instance_id);
    if (!zoneinfo.success) {
        console.error(`Could not retrieve API endpoint information: ${zoneinfo.errors.join('; ')}`);
        process.exit(1);
    }
    const api_endpoint = zoneinfo.api_endpoint;
    console.log(`- Instance API Endpoint: ${api_endpoint}\n`);

    const workflows_path = path.join(process.cwd(), 'workflows');    
    if (!fs.existsSync(workflows_path)) {
        console.error('./workflows path does not exist in tempate');
        process.exit(1);
    }

    const workflows = [];
    if (workflow_filter !== '') {
        let workflow_files = [];
        try {
            // Get list of workflows that match filter
            workflow_files = fs.readdirSync(workflows_path);
            for (const workflow_file of workflow_files) {
                if (hblib.wildcard_search(`${app}__${workflow_type}__${workflow_filter}.json`, workflow_file)) workflows.push(workflow_file);
            }
        } catch (e) {
            console.error(`Failed to retrieve list of workflows for app [${app}] and filter [${workflow_filter}]:\n${e}`);
            process.exit(1);
        }
    } else {
        const workflow_path = `${app}__${workflow_type}__${workflow_id}.json`;
        workflows.push(workflow_path);
    }
    console.log(`Workflows to push back to instance ${instance_id}:\n\n* ${workflows.join('\n* ')}`);
    let workflow_success = 0;
    for (const workflow of workflows) {
        const workflow_id = workflow.replace(`${app}__`, '').replace(`${workflow_type}__`, '').replace('.json', '');
        try {
            const workflow_definition = JSON.parse(fs.readFileSync(path.join(workflows_path, workflow), { encoding: 'utf8' }));
            const workflow_exists = await does_workflow_exist(workflow_id);
            const workflow_push = await push_workflow(workflow_exists, workflow_definition);
            if (!workflow_push.success) {
                console.error(`Failed to push workflow [${workflow_id}] to Hornbill instance: ${workflow_push.errors.join(';')}`);
            } else {
                if (!workflow_exists) {
                    // Need to do another call to update the definition in the new workflow, because of inconsistencies
                    // between workflowAdd and workflowSaveDraft
                    await push_workflow(true, workflow_definition);
                }
                workflow_success++;
            }
        } catch (e) {
            console.error(`Failed to push workflow [${workflow_id}] to Hornbill instance:\n${e}`);
        }
    }

    if (workflow_success < workflows.length) {
        console.error(`\nFailed to push ${workflows.length - workflow_success} of ${workflows.length} workflows.\n`);
        process.exit(1);
    }
    console.log(`\nSuccessfully pushed ${workflow_success} workflows\n`)
})();