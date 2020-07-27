import dgram = require('dgram');
import dns = require('dns');

export type ClientListener = (event: string, ...args: any[]) => void;
export type MessageCallback = (
  team: TeamData,
  payload: Buffer,
  rinfo: dgram.RemoteInfo,
) => void;

export type TeamData = {
  name: string;
  address: string;
  port: number;
};

export class UDPServers {
  private servers: Array<UDPServer>;
  private clients: Map<string, ClientListener>;

  constructor(teams: Array<TeamData>) {
    this.clients = new Map<string, ClientListener>();
    this.servers = new Array<UDPServer>();

    teams.forEach((team: TeamData) => {
      // Determine if we are listening on a IPv4 or IPv6 address and resolve any DNS address
      // If the specified address can be resolved to an IPv4 address prefer that over an IPv6 address
      dns.lookup(
        team.address,
        { family: 0, all: true },
        (
          error: NodeJS.ErrnoException | null,
          addresses: dns.LookupAddress[],
        ) => {
          // Find the first IPv4 and IPv6 addresses that were returned
          let ipv4 = '';
          let ipv6 = '';
          addresses.forEach((address: dns.LookupAddress) => {
            if (address.family === 6 && ipv6 === '') {
              ipv6 = address.address;
            }
            if (address.family === 4 && ipv4 === '') {
              ipv4 = address.address;
            }
          });

          // Prefer IPv4 addresses
          if (ipv4 !== '') {
            this.servers.push(
              UDPServer.of(
                { name: team.name, address: ipv4, port: team.port },
                (team: TeamData, payload: Buffer, rinfo: dgram.RemoteInfo) => {
                  this.onMessage(team, payload, rinfo);
                },
                false,
              ),
            );
          } else if (ipv6 !== '') {
            this.servers.push(
              UDPServer.of(
                { name: team.name, address: ipv6, port: team.port },
                (team: TeamData, payload: Buffer, rinfo: dgram.RemoteInfo) => {
                  this.onMessage(team, payload, rinfo);
                },
                true,
              ),
            );
          } else {
            console.log(
              `UDPServer encountered an error resolving a DNS address: Error: ${error?.code}\n${error?.stack}`,
            );
          }
        },
      );
    });
  }

  static of(teams: Array<TeamData>) {
    return new UDPServers(teams);
  }

  // Add a new client to our list of clients
  on(client: string, emit_cb: ClientListener) {
    // If the client is already in our list, remove it
    if (this.clients.has(client)) {
      this.clients.delete(client);
    }

    // Add the client
    this.clients.set(client, emit_cb);

    // Return the off callback
    return () => this.clients.delete(client);
  }

  // One of the UDP servers received a new message, send it on to all clients
  private onMessage = (
    team: TeamData,
    packet: Buffer,
    rinfo: dgram.RemoteInfo,
  ) => {
    for (let emit_cb of this.clients.values()) {
      emit_cb('udp_packet', {
        payload: packet,
        team: {
          name: team.name,
          address: team.address,
          port: team.port,
        },
        rinfo: {
          family: rinfo.family,
          address: rinfo.address,
          port: rinfo.port,
        },
      });
    }
  };
}

class UDPServer {
  private socket: dgram.Socket;

  constructor(
    private team: TeamData,
    private msg_cb: MessageCallback,
    ipv6: boolean,
  ) {
    if (ipv6) {
      this.socket = dgram.createSocket({ type: 'udp6', reuseAddr: true });
    } else {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    }

    this.socket.on('listening', () => {
      // Add multicast membership if we are using a multicast address
      if (ipv6) {
        // IPv6 multicast addresses start with 0xFF00
        if (team.address.split(':')[0].toUpperCase() === 'FF00') {
          this.socket.addMembership(team.address);
        }
      } else {
        // IPv4 multicast addresses start with 0xE
        const octet = Number(team.address.split('.')[0])
          .toString(16)
          .toUpperCase();
        if (octet.startsWith('E')) {
          this.socket.addMembership(team.address);
        }
      }
      const address = this.socket.address();
      console.log(
        `${team.name} UDP Server: Listening on ${address.address}:${address.port}`,
      );
    });

    this.socket.on('error', (error: Error) => {
      console.log(`${team.name} UDP Server: Error:\n${error.stack}`);
      this.socket.close();
    });

    this.socket.on('message', (packet: Buffer, rinfo: dgram.RemoteInfo) => {
      console.log(
        `${team.name} UDP Server: Received a message from ${rinfo.family}:${rinfo.address}:${rinfo.port}`,
      );
      this.msg_cb(this.team, packet, rinfo);
    });

    this.socket.on('close', () => {
      console.log('${team.name} UDP Server: Closed');
    });

    this.socket.bind({ port: team.port, address: team.address });
  }

  static of(team: TeamData, msg_cb: MessageCallback, ipv6: boolean) {
    return new UDPServer(team, msg_cb, ipv6);
  }
}
