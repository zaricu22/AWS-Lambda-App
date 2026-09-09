package com.example.items;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AWS: DynamoDbClient and ObjectMapper are created once per execution environment
 * (static fields, not per-invocation) so warm invocations reuse them.
 * The Lambda analogue of the Fargate sample's long-lived JDBC pool,
 * minus a pool itself since DynamoDB has no connections to hold open.
 *
 * API Gateway's (analogue to Fargate sample's LoadBalancer):
 * HttpUserPoolAuthorizer (backend-stack) already validated the caller's Cognito JWT
 * before this handler ever runs, so unlike the Fargate sample's SecurityConfig/CognitoClientIdValidator,
 * there is no token validation code here in Java app at all.
 *
 * Request mapping (/api/items) is done by AWS API Gateway, defined in apigwv2.HttpApi routes (backend-stack)
 */
public class ItemsHandler implements RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

    private static final DynamoDbClient DDB = DynamoDbClient.create();
    private static final ObjectMapper MAPPER = new ObjectMapper();
    // TABLE_NAME ← TABLE_NAME env-var on Lambda function (backend-stack)
    // ← props.itemsTable.tableName ← DataStack.itemsTable ← tableName: TABLE_NAME (data-stack)
    private static final String TABLE_NAME = System.getenv("TABLE_NAME");

    @Override
    public APIGatewayV2HTTPResponse handleRequest(APIGatewayV2HTTPEvent event, Context context) {
        try {
            ScanResponse response = DDB.scan(ScanRequest.builder().tableName(TABLE_NAME).build());

            List<Map<String, Object>> items = new ArrayList<>();
            for (Map<String, AttributeValue> row : response.items()) {
                items.add(toDto(row));
            }

            return APIGatewayV2HTTPResponse.builder()
                    .withStatusCode(200)
                    .withHeaders(Map.of("Content-Type", "application/json"))
                    .withBody(MAPPER.writeValueAsString(items))
                    .build();
        } catch (Exception e) {
            context.getLogger().log("Failed to list items: " + e.getMessage());
            return APIGatewayV2HTTPResponse.builder()
                    .withStatusCode(500)
                    .withHeaders(Map.of("Content-Type", "application/json"))
                    .withBody("{\"error\":\"Failed to load items\"}")
                    .build();
        }
    }

    private static Map<String, Object> toDto(Map<String, AttributeValue> row) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", Long.parseLong(row.get("id").n()));
        dto.put("name", row.get("name").s());
        dto.put("description", row.containsKey("description") ? row.get("description").s() : null);
        dto.put("createdAt", row.get("createdAt").s());
        return dto;
    }
}
