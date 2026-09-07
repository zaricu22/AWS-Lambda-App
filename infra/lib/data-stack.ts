import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cr from 'aws-cdk-lib/custom-resources';

const TABLE_NAME = 'items';

// Mirrors the Fargate sample's V2__seed_items.sql seed data exactly, so the
// same e2e test ("Wireless Mouse" visible after login) passes against either backend.
const SEED_ITEMS: Array<{ id: number; name: string; description: string }> = [
  { id: 1, name: 'Wireless Mouse', description: 'Ergonomic wireless mouse with USB-C charging' },
  { id: 2, name: 'Standing Desk', description: 'Electric height-adjustable standing desk' },
  { id: 3, name: 'Mechanical Keyboard', description: 'Hot-swappable mechanical keyboard with brown switches' },
  { id: 4, name: '4K Monitor', description: '27-inch 4K IPS monitor with USB-C hub' },
  { id: 5, name: 'Noise-Cancelling Headphones', description: 'Over-ear headphones with active noise cancellation' },
  { id: 6, name: 'Webcam', description: '1080p webcam with auto-focus and built-in microphone' },
  { id: 7, name: 'Laptop Stand', description: 'Aluminum laptop stand with adjustable height' },
  { id: 8, name: 'USB-C Dock', description: 'Multi-port docking station with HDMI and Ethernet' },
];

export class DataStack extends cdk.Stack {
  public readonly itemsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // On-demand billing: no capacity to plan for a sample with 8 rows and
    // near-zero traffic. Compare to the Fargate sample's RDS instance,
    // which bills a fixed hourly rate whether or not anyone hits it.
    this.itemsTable = new dynamodb.Table(this, 'ItemsTable', {
      tableName: TABLE_NAME,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // AWS: the Fargate sample's V2__seed_items.sql Flyway migration has no
    // DynamoDB equivalent -- Flyway versions relational schemas, not NoSQL
    // tables. An AwsCustomResource issuing one BatchWriteItem call on stack
    // creation is the standard CDK substitute for one-time seed data. It
    // runs onCreate only (not on every deploy), so editing SEED_ITEMS after
    // the table already exists has no effect -- destroy and recreate
    // DataStack (or add a migration Lambda) to reseed.
    const createdAt = new Date().toISOString();
    new cr.AwsCustomResource(this, 'SeedItems', {
      onCreate: {
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [TABLE_NAME]: SEED_ITEMS.map((item) => ({
              PutRequest: {
                Item: {
                  id: { N: item.id.toString() },
                  name: { S: item.name },
                  description: { S: item.description },
                  createdAt: { S: createdAt },
                },
              },
            })),
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of('SeedItemsOnCreate'),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [this.itemsTable.tableArn] }),
    });

    new cdk.CfnOutput(this, 'TableName', { value: this.itemsTable.tableName });
  }
}
