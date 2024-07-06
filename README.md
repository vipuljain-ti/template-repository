# Deployment Guide

This document outlines the deployment process for the project, including generating necessary configuration files, setting up GitHub Secrets, and modifying tunable parameters. Follow these steps closely to ensure successful deployment.

## Important Files

1. Please ensure that you replace the `openapi.json` file with your `OpenAPI Spec`. 

2.  **Generate `schema.graphql`**:
    
    Ensure you have the `.meshrc.yaml` configuration file ready in your project directory. To generate the `schema.graphql`, use the following command:

    ```bash
    npx mesh dev
    ```
    For more details on GraphQL Mesh, please refer to the official documentation: [GraphQL Mesh](https://the-guild.dev/graphql/mesh/docs/getting-started/your-first-mesh-gateway)

3.  You must maintain a file containing VTL Templates, current file_name is `generated_vtl_new.json`. You can refer this `vtl_gen.py` to understand more about this.

4.  If you want to rename any file or its path, please make sure to reflect those changes in all the files and subdirectories.

## GitHub Secrets Configuration

To securely manage your AWS credentials and other sensitive information, configure the following GitHub Secrets in your repository:

`AWS_ACCESS_KEY_ID`: Your AWS Access Key ID.

`AWS_SECRET_ACCESS_KEY`: Your AWS Secret Access Key.

`AWS_REGION`: Your AWS default region.

These secrets will be used by the GitHub Actions workflows to authenticate and deploy your resources to AWS.

## Modify Tunable Parameters

You can customize the deployment by modifying the following parameters in `/lib/project-stack.ts`:

`MAX_RESOURCES_PER_STACK`: Adjust this parameter to control the maximum resources per CloudFormation stack.

`APP_NAME`: Set this to define the application name used in resource naming and management.

## Resolvers Setup

Place all your resolver scripts in the `./resolvers` folder in the root directory of your project. This standardizes the location and management of these scripts across your deployment.

## CI/CD Process

Once you push your code changes to the repository, the CI/CD pipeline defined in `.github/workflows/deploy_stack.yml` will automatically handle the deployment. This action file contains all the necessary steps involved in the deployment process.

If you encounter issues during deployment, review the steps executed in the `.github/workflows/deploy_stack.yml` file to identify and resolve the problems.
