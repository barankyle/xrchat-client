import Layout from '../../../components/ui/Layout'
import dynamic from "next/dynamic";
//Certain libraries/functions in three.js don't play well with SSR.
//The solution is to import them in a component and dynamically render the component in React so that SSR
//doesn't try to touch it, as demonstrated below.
const EcsyExample = dynamic(() => import('../../../components/ecsy/example'), {
    ssr: false
})

const EcsyPage = () => {
  return (
      <Layout pageTitle="Home">
          <EcsyExample/>
      </Layout>
  )
}

export default EcsyPage
