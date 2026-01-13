import cassandra from 'cassandra-driver'
export class DataSource {


    constructor(private readonly client?: cassandra.Client) {
        this.client = client ?? new cassandra.Client({
            contactPoints: Bun.env.CASSANDRA_CONTACT_POINTS?.split(','),
            keyspace: Bun.env.CASSANDRA_KEYSPACE,
        })


    }
}