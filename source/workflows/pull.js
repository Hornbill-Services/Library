(async () => {
    const version = '1.0';

    const fs = require('node:fs');
    const path = require('node:path');

    console.log('\n==== Hornbill Services Automation ====');
    console.log(`======== Pull Workflow/s v${version} ========`);

    const hblib = require('../common/hb-module.js');

    let instance_id = '';
    let api_key = '';
    let app = '';
    let workflow_id = '';
    let workflow_filter = '';
    let workflow_state = 'all';
    let workflow_type = '';

    const get_workflow_list = async () => {
        console.log(`Getting list of workflows for app [${app}] and filter [${workflow_filter}]`);
        const response = {
            success: false,
            errors: [],
            workflows: []
        };
        const payload = {
            '@service': 'bpm',
            '@method': 'workflowList',
            params: {
                application: app,
                filter: workflow_filter,
                pageInfo: {
                    pageIndex: 1,
                    pageSize: 100
                },
                type: workflow_type
            }
        }
        if (workflow_state !== 'all') payload.params.activeState = workflow_state
        
        const api_response = await hblib.invoke(`${api_endpoint}${payload['@service']}`, api_key, payload);
        if (!api_response.success) {
            response.errors = api_response.errors;
        } else {
            response.success = true;
            response.workflows = api_response.data.params.workflow;
        }
        return response;
    };

    const get_workflow = async (workflow) => {
        console.log(`Retrieving definition for workflow: ${workflow}`);
        const response = {
            success: false,
            errors: [],
            workflow: {}
        };
        const payload = {
            '@service': 'bpm',
            '@method': 'workflowGet',
            params: {
                application: app,
                name: workflow,
                version: 0
            }
        }
        const api_response = await hblib.invoke(`${api_endpoint}${payload['@service']}`, api_key, payload);
        if (!api_response.success) {
            response.errors = api_response.errors;
        } else {
            response.success = true;
            response.workflow = api_response.data.params;
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
                case '-state':
                    x++;
                    if (x < process.argv.length) workflow_state = process.argv[x];
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
    console.log(`- Workflow State: ${workflow_state}`);

    // Get API endpoint for instance
    const zoneinfo = await hblib.get_endpoints(instance_id);
    if (!zoneinfo.success) {
        console.error(`Could not retrieve API endpoint information: ${zoneinfo.errors.join('; ')}`);
        process.exit(1);
    }
    const api_endpoint = zoneinfo.api_endpoint;
    console.log(`- Instance API Endpoint: ${api_endpoint}\n`);

    const workflows = [];
    if (workflow_filter !== '') {
        // Get list of workflows that match filter
        const workflow_list = await get_workflow_list();
        if (workflow_list.success) {
            for (const workflow of workflow_list.workflows) {
                workflows.push(workflow.name);
            }
        } else {
            console.error(`Failed to retrieve list of workflows for app [${app}] and filter [${workflow_filter}]:`);
            console.error(workflow_list.errors.join('\n'));
            process.exit(1);
        }
    } else {
        workflows.push(workflow_id);
    }

    // Get Workflow Definitions
    const workflow_definitions = [];
    for (const workflow of workflows) {
        const workflow_definition = await get_workflow(workflow);
        if (!workflow_definition.success) {
            console.error(`Failed to get definition for workflow [${workflow}]:`);
            console.error(workflow_definition.errors.join('\n'));
        } else {
            workflow_definition.workflow.name = workflow;
            workflow_definitions.push(workflow_definition.workflow);
        }
    }
    const workflows_path = path.join(process.cwd(), 'workflows');
    if (!fs.existsSync(workflows_path)) {
        console.error('./workflows path does not exist in tempate');
        process.exit(1);
    }
    let workflow_success = 0;
    let workflow_error = 0;
    console.log(`\nWorkflow definitions found & returned: ${workflow_definitions.length}. Processing...`)
    for (const workflow_definition of workflow_definitions) {
        const workflow_path = path.join(workflows_path, `${app}_${workflow_definition.name}.json`);
        if (fs.existsSync(workflow_path)) {
            console.log(`Overwriting workflow definition in repo: ${app}_${workflow_definition.name}.json`);
        } else {
            console.log(`Creating workflow definition in repo: ${app}_${workflow_definition.name}.json`);
        }
        try {
            fs.writeFileSync(workflow_path, JSON.stringify(workflow_definition));
            workflow_success++;
        } catch (e) {
            console.error(`Error creating workflow at ${workflow_path}`);
            console.error(`Error creating workflow at ${e}`);
            workflow_error++;
        }
    }
    if (workflow_error > 0) {
        console.log(`\nError creating ${workflow_error} workflow definition files. Successfully created ${workflow_success} of ${workflow_definitions.length} definitions.`);
        process.exit(1);
    }
    console.log(`\nSuccessfully created ${workflow_success} definitions.`);
})();