import * as cdk from 'aws-cdk-lib';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

interface ApiGatewayRefNestedStackProps extends NestedStackProps {
}

export class ApiGatewayRefNestedStack extends NestedStack {
  public readonly apiGateway: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayRefNestedStackProps) {
    super(scope, id, props);

    this.apiGateway = new apigateway.RestApi(this, `${id}ApiGateway`, {
      restApiName: `${id}Service`,
      description: `API Gateway for ${id}`,
      });
  }
}