using { Currency, managed, cuid } from '@sap/cds/common';

namespace cap.po.approval;

service ApprovalService {
    
    // Action to process workflow decision
    action processWorkflowDecision(
        instanceId: String(20) @title: 'Workflow Instance ID',
        decision: String(4) @title: 'Decision Key (0001=Approve, 0002=Reject)',
        comments: String(255) @title: 'Comments'
    ) returns {
        success: Boolean @title: 'Success Status';
        message: String(255) @title: 'Response Message';
        instanceId: String(20) @title: 'Instance ID';
        decision: String(4) @title: 'Decision Key';
    };
    
    // Action to test S/4HANA connection
    action testConnection() returns {
        success: Boolean @title: 'Connection Success';
        message: String(255) @title: 'Connection Message';
        status: Integer @title: 'HTTP Status';
        timestamp: String(50) @title: 'Test Timestamp';
    };

}