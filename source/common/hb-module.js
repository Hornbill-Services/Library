(() => {
  const axios = require("axios");
  const xmljs = require("xml-js");

  exports.get_endpoints = async (instance_id) => {
    const response = {
      success: false,
      errors: [],
      api_endpoint: "",
      dav_endpoint: "",
      ws_endpoint: "",
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

  exports.invoke = async (
    endpoint,
    api_key,
    payload,
    additional_headers = {},
    xml_response = false
  ) => {
    const response = {
      success: false,
      errors: [],
      data: {},
      xml_data: "",
    };
    const options = { headers: { Authorization: `ESP-APIKEY ${api_key}` } };
    for (const key in additional_headers) {
      if (Object.hasOwn(additional_headers, key)) {
        options.headers[key] = additional_headers[key];
      }
    }
    if (xml_response) {
      options.headers.Accept = "text/xmlmc";
    }

    const job_details = await axios.post(`${endpoint}`, payload, options);

    if (job_details.status !== 200) {
      response.errors.push(`Unexpected status: ${job_details.status}`);
    } else {
      if (xml_response) {
        // Convert to JSON, check status and send JSON & XML back if success
        const xml_doc = xmljs.xml2js(job_details.data, { compact: true, spaces: 4 });
        if (!xml_doc.methodCallResult._attributes.status === 'ok' ) {
            response.errors.push(xml_doc.methodCallResult.state.error._text);
          } else {
            response.success = true;
            response.data = xml_doc;
            response.xml_data = job_details.data;
          }
      } else {
        if (!job_details.data["@status"]) {
          response.errors.push(job_details.data.state.error);
        } else {
          response.success = true;
          response.data = job_details.data;
        }
      }
    }

    return response;
  };

  exports.get_job_status = async (endpoint, api_key, job_id) => {
    console.log(`Checking status of background job [${job_id}]`);
    const response = {
      success: false,
      finished: false,
      errors: [],
      status: "",
    };
    const payload = {
      "@service": "system",
      "@method": "backgroundJobStatus",
      params: {
        jobId: job_id,
      },
    };
    const api_response = await this.invoke(
      `${endpoint}${payload["@service"]}`,
      api_key,
      payload
    );
    if (!api_response.success) {
      response.errors = api_response.errors;
      response.finished = true;
    } else if (api_response.data.params.status === "failed") {
      response.errors.push(api_response.data.params.progressMessage);
      response.finished = true;
    } else {
      response.success = true;
      console.log(`Current status [${api_response.data.params.status}]`);
      response.finished =
        api_response.data.params.status === "succeed" ||
        api_response.data.params.status === "failed";
    }
    return response;
  };

  exports.wildcard_search = (wildcard, str) => {
    const w = wildcard.replace(/[.+^${}()|[\]\\]/g, "\\$&"); // regexp escape
    const re = new RegExp(
      `^${w.replace(/\*/g, ".*").replace(/%/g, ".*").replace(/\?/g, ".")}$`,'i');
    return re.test(str);
  };
})();
