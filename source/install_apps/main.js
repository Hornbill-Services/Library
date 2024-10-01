(async () => {
    const version = '1.0';

    const fs = require('node:fs');

    console.log('\n=== Hornbill Services Automation ===');
    console.log(`======== App Installer v${version} ========`);

    const hblib = require('../common/hb-module.js');

    let instance_id = '';
    let api_key = '';
    let app_json_path = '';
    let app_ids = [];

    const install_app = async (app_id) => {
        console.log(`\nInstalling app: ${app_id}`);
        const response = {
            success: false,
            errors: [],
            job_id: 0
        };
        const payload = {
            '@service': 'admin',
            '@method': 'appInstall',
            params: {
                applicationId: app_id
            }
        }
        const api_response = await hblib.invoke(`${api_endpoint}${payload['@service']}`, api_key, payload);
        if (!api_response.success) {
            response.errors = api_response.errors;
        } else {
            response.success = true;
            response.job_id = Number.parseInt(api_response.data.params.jobId, 10);
        }
        return response;
    };

    const process_args = () => {
        // Process command line args
        for (let x = 0; x < process.argv.length; x++) {
            if (process.argv[x] === "-instance") {
                x++;
                if (x < process.argv.length) instance_id = process.argv[x];
            } else if (process.argv[x] === "-apikey") {
                x++;
                if (x < process.argv.length) api_key = process.argv[x];
            } else if (process.argv[x] === "-appjson") {
                x++;
                if (x < process.argv.length) app_json_path = process.argv[x];
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
        if (app_json_path === '') {
            console.log('-appjson arg is mandatory');
            process.exit(1);
        }

        if (!fs.existsSync(app_json_path)) {
            console.log('JSON file that contains the list of apps does not exist.');
            process.exit(1);
        }
        app_ids = JSON.parse(fs.readFileSync(app_json_path)).apps;
    };

    // Process CLI arguments
    process_args();

    console.log(`\n- Instance ID: ${instance_id}`);
    console.log(`- Apps: ${app_ids.join(', ')}`);

    // Get API endpoint for instance
    const zoneinfo = await hblib.get_endpoints(instance_id);
    if (!zoneinfo.success) {
        console.error(`Could not retrieve API endpoint information: ${zoneinfo.errors.join('; ')}`);
        process.exit(1);
    }
    const api_endpoint = zoneinfo.api_endpoint;
    console.log(`- Instance API Endpoint: ${api_endpoint}`);

    let apps_installed = 0;
    // Install apps
    for (const app_id of app_ids) {
        const app_job = await install_app(app_id);
        if (!app_job.success) {
            console.error(`Failed to install app [${app_id}]:`);
            console.error(app_job.errors.join('\n'));
        } else {
            let job_ended = false;
            while (!job_ended) {
                const job_status = await hblib.get_job_status(api_endpoint, api_key, app_job.job_id);
                job_ended = job_status.finished;
                if (!job_status.success) {
                    console.error(`App install job failed: ${job_status.errors.join('; ')}`);
                }
                if (job_ended && job_status.success) {
                    console.log(`App installed successfully: ${app_id}`);
                    apps_installed++;
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }

    if (apps_installed !== app_ids.length) {
        console.error(`\nFailed to install ${app_ids.length - apps_installed} of ${app_ids.length} apps.\n`);
        process.exit(1);
    }
    console.log('\nAll apps installed successfully\n');

})();