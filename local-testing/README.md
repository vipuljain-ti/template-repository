# Local GraphQL Testing

## Setup Instructions

1. **Navigate to the `local-testing` Directory**

   ```sh
   cd local-testing
   ```
2. **Install the Requirements**

    Use the following command to install the necessary dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3. **Resolvers Config**

    The local GraphQL server needs the path to all the lambda resolvers so that it can forward requests to the original resolvers.

    We will maintain a JSON config file which will point to the exact resolver for each query/mutation. This is how the `resolvers-config.json` would look:

    ```json
    {
        "queries": {
            "ListGroups": {
                "resolver_path": "resolvers/ListGroups/resolver.py",
                "resolver_handler": "lambda_handler"
            }
        },
        "mutations": {
            "CreateUser": {
                "resolver_path": "resolvers/CreateUser/resolver.py",
                "resolver_handler": "lambda_handler"
            }
        }
    }
    ```

    Make sure that the `resolver_path` is correct for all the resolvers.

4. **Local DynamoDB Setup**

    For detailed instructions on downloading, installing, and running Local DynamoDB, please refer to the official AWS guide:

    [Local DynamoDB Setup Instructions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)
  
    1. **Create a `.env` file** in the `resolvers` directory of your project.

    2. Add the DynamoDB table name to the `.env` file like so:


    ```plaintext
    DYNAMODB_TABLE=<Table_Name>
    ```

5. **Running the Server**
    Make sure that the `/path/to/schema.graphql` is correct based on your system in this `local-graphql-server.py` file.
    
    After completing the above steps, you can execute the following command to start the server:

    ```bash
    python local-graphql-server.py
    ```
    
