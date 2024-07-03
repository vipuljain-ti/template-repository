import * as cdk from 'aws-cdk-lib';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as appsync from 'aws-cdk-lib/aws-appsync';

interface ApiRefNestedStackProps extends NestedStackProps {
  apiId: string;
}

export class ApiRefNestedStack extends NestedStack {
  public readonly api: appsync.IGraphqlApi;

  constructor(scope: Construct, id: string, props: ApiRefNestedStackProps) {
    super(scope, id, props);

    const { apiId } = props;

    this.api = appsync.GraphqlApi.fromGraphqlApiAttributes(this, `${id}ApiRef`, {
      graphqlApiId: apiId,
    });
  }
}