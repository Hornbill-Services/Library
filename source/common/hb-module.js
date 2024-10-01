( () => {
    
    const axios = require('axios');

    exports.get_endpoints = async (instance_id) => {
        const response = {
            success: false,
            errors: [],
            api_endpoint: '',
            dav_endpoint: '',
            ws_endpoint: ''
        };

        const zoneinfo_links = [
            `https://files.hornbill.com/instances/${instance_id}/zoneinfo`,
            `https://files.hornbill.co/instances/${instance_id}/zoneinfo`,
        ];

        for (let i = 0; i < zoneinfo_links.length; i++) {
            try {
                const file_response = await axios.get(zoneinfo_links[i]);
                if (file_response.status !== 200) {
                    throw `Unexpected Status ${file_response.status}`;
                }
                response.success = true;
                response.api_endpoint = file_response.data.zoneinfo.apiEndpoint;
                response.dav_endpoint = file_response.data.zoneinfo.davEndpoint;
                response.ws_endpoint = file_response.data.zoneinfo.wsEndpoint;
                break;
            } catch (e) {
                response.errors.push(
                    `Error getting zoneinfo from [${zoneinfo_links[i]}]: ${e}`
                );
            }
        }
        return response;
    };

    exports.invoke = async (endpoint, api_key, payload) => {
        const response = {
            success: false,
            errors: [],
            data: {}
        };
        const options = { headers: { Authorization: `ESP-APIKEY ${api_key}` } };

        const job_details = await axios.post(`${endpoint}`, payload, options);
        if (job_details.status !== 200) {
            response.errors.push(`Unexpected status: ${job_details.status}`);
        } else {
            if (!job_details.data['@status']) {
                response.errors.push(job_details.data.state.error);
            } else {
                response.success = true;
                response.data = job_details.data;
            }
        }
        return response;
    };

    exports.get_job_status = async (job_id) => {
        console.log(`Checking status of background job [${job_id}]`);
        const response = {
            success: false,
            finished: false,
            errors: [],
            status: ''
        };
        const payload = {
            '@service': 'system',
            '@method': 'backgroundJobStatus',
            params: {
                jobId: job_id
            }
        }
        const api_response = await hblib.invoke(`${api_endpoint}${payload['@service']}`, api_key, payload);
        if (!api_response.success) {
            response.errors = api_response.errors;
            response.finished = true;
        } else if (api_response.data.params.status === 'failed') {
            response.errors.push(api_response.data.params.progressMessage);
            response.finished = true;
        } else {
            response.success = true;
            console.log(`Current status [${api_response.data.params.status}]`);
            response.finished = (api_response.data.params.status === 'succeed' || api_response.data.params.status === 'failed');
        }
        return response;
    };

})();