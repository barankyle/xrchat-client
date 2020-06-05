import { ApolloClient, HttpLink, InMemoryCache, split } from '@apollo/client'
import { getMainDefinition } from '@apollo/client/utilities'
import { WebSocketLink } from '@apollo/link-ws'
import getUserInstance from '../apollo/mutations/user-instance/get-user-instance-by-id.gql'
import addUserInstance from '../apollo/mutations/user-instance/add-user-instance.gql'
import patchUserInstance from '../apollo/mutations/user-instance/patch-user-instance.gql'
import userInstanceCreated from '../apollo/subscriptions/user-instance/user-instance-created.gql'
import userInstancePatched from '../apollo/subscriptions/user-instance/user-instance-patched.gql'

async function main(authUser) {
  const httpLink = new HttpLink({
    uri: 'http://localhost:3030/graphql'
  })

  const wsLink = new WebSocketLink({
    uri: 'ws://localhost:3030/subscriptions',
    options: {
      reconnect: true
    }
  })

  const link = split(
    ({ query }) => {
      const definition = getMainDefinition(query)
      return (
        definition.kind === 'OperationDefinition' && definition.operation === 'subscription'
      )
    },
    wsLink,
    httpLink
  )

  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: link
  })

  const userInstanceCreatedObserver = client.subscribe({
    query: userInstanceCreated
  })

  const userInstancePatchedObserver = client.subscribe({
    query: userInstancePatched
  })

  if (authUser && authUser.id && authUser.id.length > 0) {
    userInstanceCreatedObserver.subscribe({
      next(data) {
        const newUser = data.data.userInstanceCreated
        if (newUser && newUser.id !== authUser.id) {
          console.log('WELCOME NEW USER ' + newUser.name)
        }
      }
    })

    userInstancePatchedObserver.subscribe({
      next(data) {
        const updatedUser = data.data.userInstancePatched
        if (updatedUser && updatedUser.id !== authUser.id) {
          console.log('USER ' + updatedUser.name + ' HAS BEEN UPDATED')
          console.log(updatedUser.position)
        }
      }
    })

    const userExists = await client.mutate({
      mutation: getUserInstance,
      variables: {
        id: authUser.id
      }
    })

    if (userExists.data.getUserInstance == null) {
      await client.mutate({
        mutation: addUserInstance,
        variables: {
          id: authUser.id,
          name: authUser.name,
          position: {
            x: Math.floor(Math.random() * 100 + 1),
            y: Math.floor(Math.random() * 100 + 1),
            z: Math.floor(Math.random() * 100 + 1)
          }
        }
      })

      console.log('Added instance user ' + authUser.name)
    }

    console.log('INIT TICKUPDATE')
    tickUpdate()
  }

  function tickUpdate() {
    setTimeout(async () => {
      console.log('PATCHING USER')
      await client.mutate({
        mutation: patchUserInstance,
        variables: {
          id: authUser.id,
          position: {
            x: Math.floor(Math.random() * 100 + 1),
            y: Math.floor(Math.random() * 100 + 1),
            z: Math.floor(Math.random() * 100 + 1)
          }
        }
      })

      console.log('Updated this user')
      tickUpdate()
    }, 5000)
  }
}

export default main
