import Layout from '../components/ui/Layout'
import dynamic from "next/dynamic";
const EcsyExample = dynamic(() => import('../components/ecsy/example'))

const EcsyPage = () => {
  return (
      <Layout pageTitle="Home">
          <EcsyExample/>
      </Layout>
  )
}

export default EcsyPage
