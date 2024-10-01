(async () => {
    const version = '1.0';

    const fs = require('node:fs');

    console.log('\n====== Hornbill Services Automation ======');
    console.log(`======== Sys and App Setting v${version} ========`);

    const hblib = require('../common/hb-module.js');

    let instance_id = '';
    let api_key = '';
    let json_path = '';
    let apps = [];
    let settings_updated = 0;

    const set_settings = async (app, settings) => {
        console.log(`Updating settings for: [${app}]`)
        const response = {
            success: false,
            errors: []
        };
        const payload = {
            '@service': 'admin',
            '@method': app === 'platform' ? 'sysOptionSet' : 'appOptionSet',
            params: {}
        };
        if (app !== 'platform') {
            payload.params.appName = app;
        }
        payload.params.option = [];
        for (const setting of settings) {
            payload.params.option.push({key: setting.id, value: String(setting.value)});
        }
        const api_response = await hblib.invoke(`${api_endpoint}${payload['@service']}`, api_key, payload);
        if (!api_response.success) {
            response.errors = api_response.errors;
        } else {
            response.success = true;
            settings_updated += settings.length;
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
            } else if (process.argv[x] === "-json") {
                x++;
                if (x < process.argv.length) json_path = process.argv[x];
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
        if (json_path === '') {
            console.log('-json arg is mandatory');
            process.exit(1);
        }

        if (!fs.existsSync(json_path)) {
            console.log('JSON file that contains the list of apps does not exist.');
            process.exit(1);
        }
        apps = JSON.parse(fs.readFileSync(json_path));
    };

    // Process CLI arguments
    process_args();

    console.log(`\n- Instance ID: ${instance_id}`);

    // Get API endpoint for instance
    const zoneinfo = await hblib.get_endpoints(instance_id);
    if (!zoneinfo.success) {
        console.error(`Could not retrieve API endpoint information: ${zoneinfo.errors.join('; ')}`);
        process.exit(1);
    }
    const api_endpoint = zoneinfo.api_endpoint;
    console.log(`- Instance API Endpoint: ${api_endpoint}`);

    let apps_set = 0;
    // Add roles to users
    for (const key in apps) {
        const job = await set_settings(key, apps[key]);
        if (!job.success) {
            console.error(`Failed to set settings against app [${key}]:`);
            console.error(job.errors.join('\n'));
        } else {
            apps_set++;
        }
    }

    if (apps_set !== Object.keys(apps).length) {
        console.error(`\nFailed to update the settings for ${Object.keys(apps).length - apps_set} apps out of ${Object.keys(apps).length}.\n`);
        process.exit(1);
    }
    console.log(`\n${settings_updated} settings updated successfully\n`);

})();