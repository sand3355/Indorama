const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

module.exports = cds.service.impl(async function () {
    
    // Handle workflow approval/rejection
    this.on('processWorkflowDecision', async (req) => {
        const { instanceId, decision, comments } = req.data;
        
        try {
            // Validate input parameters
            if (!instanceId || !decision) {
                const missingParams = [];
                if (!instanceId) missingParams.push('instanceId');
                if (!decision) missingParams.push('decision');
                
                console.error('Missing required parameters:', missingParams.join(', '));
                return {
                    success: false,
                    message: `Missing required parameters: ${missingParams.join(', ')}`,
                    instanceId: instanceId || 'N/A',
                    decision: decision || 'N/A',
                    timestamp: new Date().toISOString(),
                    error: 'MISSING_PARAMETERS'
                };
            }

            // Validate decision parameter
            if (decision !== '0001' && decision !== '0002') {
                console.error('Invalid decision parameter:', decision);
                return {
                    success: false,
                    message: 'Invalid decision parameter. Must be 0001 (Approve) or 0002 (Reject)',
                    instanceId: instanceId,
                    decision: decision,
                    timestamp: new Date().toISOString(),
                    error: 'INVALID_DECISION'
                };
            }
            
            // TaskProcessing service path
            const taskProcessingPath = '/sap/opu/odata/IWPGW/TASKPROCESSING;v=2';
            
            // Get CSRF Token using destination authentication
            let csrfToken = '';
            let cookies = '';
            
            try {
                const csrfResponse = await executeHttpRequest(
                    {
                        destinationName: 'S4HANA_DEV'
                    },
                    {
                        method: 'GET',
                        url: taskProcessingPath,
                        headers: {
                            'X-CSRF-Token': 'Fetch',
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );
                
                csrfToken = csrfResponse.headers?.['x-csrf-token'] || csrfResponse.headers?.['X-CSRF-Token'];
                
                // Handle cookies from response
                const setCookieHeaders = csrfResponse.headers?.['set-cookie'];
                if (setCookieHeaders) {
                    cookies = Array.isArray(setCookieHeaders) ? 
                        setCookieHeaders.join('; ') : setCookieHeaders;
                }
                
                if (!csrfToken) {
                    throw new Error('No CSRF token received from server');
                }
                
            } catch (csrfError) {
                console.error('CSRF token fetch error:', {
                    status: csrfError.response?.status || csrfError.status,
                    statusText: csrfError.response?.statusText,
                    message: csrfError.message,
                    url: taskProcessingPath
                });
                
                const status = csrfError.response?.status || csrfError.status;
                let errorMessage = 'Failed to connect to S/4HANA system';
                let errorCode = 'CSRF_ERROR';
                
                if (status === 401) {
                    errorMessage = 'Destination authentication failed. Please check destination configuration.';
                    errorCode = 'DESTINATION_AUTH_FAILED';
                } else if (status === 404) {
                    errorMessage = 'TaskProcessing service not found. Please check if the service is activated in S/4HANA.';
                    errorCode = 'SERVICE_NOT_FOUND';
                } else if (status === 403) {
                    errorMessage = 'Access denied. Destination may not have sufficient authorization.';
                    errorCode = 'ACCESS_DENIED';
                } else if (status >= 500) {
                    errorMessage = 'S/4HANA system error. Please try again later.';
                    errorCode = 'SYSTEM_ERROR';
                }
                
                return {
                    success: false,
                    message: errorMessage,
                    instanceId: instanceId,
                    decision: decision,
                    timestamp: new Date().toISOString(),
                    error: errorCode,
                    httpStatus: status
                };
            }

            // Make the Decision POST call
            const finalComments = comments || (decision === '0001' ? 'Approved via BTP Workflow System' : 'Rejected via BTP Workflow System');
            const decisionPath = `${taskProcessingPath}/Decision?InstanceID='${instanceId}'&DecisionKey='${decision}'&Comments='${encodeURIComponent(finalComments)}'`;
            
            try {
                const postResponse = await executeHttpRequest(
                    {
                        destinationName: 'S4HANA_DEV'
                    },
                    {
                        method: 'POST',
                        url: decisionPath,
                        headers: {
                            'X-CSRF-Token': csrfToken,
                            'Cookie': cookies,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        timeout: 30000,
                        data: {} 
                    }
                );

                // Check if response contains any data
                if (postResponse.data) {
                    console.log('Decision Response Data:', JSON.stringify(postResponse.data, null, 2));
                }

                const successMessage = decision === '0001' ? 
                    'Workflow task has been approved successfully' : 
                    'Workflow task has been rejected successfully';
                
                return {
                    success: true,
                    message: successMessage,
                    instanceId: instanceId,
                    decision: decision,
                    decisionText: decision === '0001' ? 'Approved' : 'Rejected',
                    comments: finalComments,
                    timestamp: new Date().toISOString(),
                    httpStatus: postResponse.status
                };
                
            } catch (postError) {
                console.error('Decision POST error:', {
                    status: postError.response?.status || postError.status,
                    statusText: postError.response?.statusText,
                    message: postError.message,
                    data: postError.response?.data,
                    url: decisionPath
                });
                
                const status = postError.response?.status || postError.status;
                let errorMessage = 'Failed to process workflow decision';
                let errorCode = 'DECISION_ERROR';
                
                if (status === 400) {
                    errorMessage = 'Invalid workflow instance or decision parameters. The workflow may have already been processed.';
                    errorCode = 'INVALID_PARAMETERS';
                } else if (status === 404) {
                    errorMessage = 'Workflow instance not found or no longer available for processing.';
                    errorCode = 'INSTANCE_NOT_FOUND';
                } else if (status === 403) {
                    errorMessage = 'You are not authorized to process this workflow instance.';
                    errorCode = 'NOT_AUTHORIZED';
                } else if (status === 409) {
                    errorMessage = 'Workflow instance has already been processed by another user.';
                    errorCode = 'ALREADY_PROCESSED';
                } else if (status >= 500) {
                    errorMessage = 'S/4HANA system error during workflow processing. Please try again later.';
                    errorCode = 'SYSTEM_ERROR';
                }
                
                return {
                    success: false,
                    message: errorMessage,
                    instanceId: instanceId,
                    decision: decision,
                    timestamp: new Date().toISOString(),
                    error: errorCode,
                    httpStatus: status,
                    details: postError.response?.data
                };
            }

        } catch (error) {
            
            const status = error.response?.status || error.status;
            let errorMessage = 'An unexpected error occurred while processing the workflow decision';
            let errorCode = 'UNEXPECTED_ERROR';
            
            if (status === 401) {
                errorMessage = 'Destination authentication failed';
                errorCode = 'DESTINATION_AUTH_FAILED';
            } else if (status === 404) {
                errorMessage = 'Workflow service or instance not found';
                errorCode = 'NOT_FOUND';
            } else if (status === 403) {
                errorMessage = 'Access denied for this workflow instance';
                errorCode = 'ACCESS_DENIED';
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage = 'Cannot connect to S/4HANA system. Please check system availability.';
                errorCode = 'CONNECTION_REFUSED';
            } else if (error.code === 'ETIMEDOUT') {
                errorMessage = 'Request timeout. S/4HANA system may be slow or unavailable.';
                errorCode = 'TIMEOUT';
            }
            
            return {
                success: false,
                message: errorMessage,
                instanceId: instanceId || 'N/A',
                decision: decision || 'N/A',
                timestamp: new Date().toISOString(),
                error: errorCode,
                httpStatus: status,
                details: error.message
            };
        }
    });

});