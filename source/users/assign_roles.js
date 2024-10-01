(async () => {
    const version = '1.0';

    const fs = require('node:fs');

    console.log('\n==== Hornbill Services Automation ====');
    console.log(`======== Role Assignment v${version} ========`);

    const hblib = require('../common/hb-module.js');

    let instance_id = '';
    let api_key = '';
    let json_path = '';
    let users = [];

    const add_roles = async (user) => {
        console.log(`\nAdding roles to user: ${user.id}`);
        const response = {
            success: false,
            errors: []
        };
        const payload = {
            '@service': 'admin',
            '@method': 'userAddRole',
            params: {
                userId: user.id,
                role: user.roles
            }
        }
        const api_response = await hblib.invoke(`${api_endpoint}${payload['@service']}`, api_key, payload);
        if (!api_response.success) {
            response.errors = api_response.errors;
        } else {
            response.success = true;
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
        users = JSON.parse(fs.readFileSync(json_path)).users;
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

    let users_set = 0;
    // Add roles to users
    for (const user of users) {
        const app_job = await add_roles(user);
        if (!app_job.success) {
            console.error(`Failed to add roles to user [${user.id}]:`);
            console.error(app_job.errors.join('\n'));
        } else {
            users_set++;
        }
    }

    if (users_set !== users.length) {
        console.error(`\nFailed to add ${users.length - users_set} of ${users.length} users roles.\n`);
        process.exit(1);
    }
    console.log('\nUser roles assigned successfully\n');

})();