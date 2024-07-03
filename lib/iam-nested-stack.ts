import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class IAMNestedStack extends cdk.NestedStack {
  public readonly lambdaExecutionRole: iam.Role;
  public readonly apiGatewayAppSyncRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    // Lambda execution role
    this.lambdaExecutionRole = new iam.Role(this, `${id}LambdaExecutionRole`, {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        description: 'Common role for all Lambda functions in the Stack',
      });

    this.lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
    actions: ['dynamodb:*'],
    resources: ['*'],
    }));

    // API Gateway AppSync role
    this.apiGatewayAppSyncRole = new iam.Role(this, `${id}ApiGatewayAppSyncRole`, {
        assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        description: 'Role for API Gateway to access AppSync',
        inlinePolicies: {
          AppSyncInvokePolicy: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['appsync:GraphQL'],
                resources: ['*'],
              }),
            ],
          }),
        },
      });
  }
}