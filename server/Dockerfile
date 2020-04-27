FROM openjdk:11 AS builder
# Install Clojure
RUN curl -s https://download.clojure.org/install/linux-install-1.10.1.536.sh | bash
WORKDIR /usr/lib/crux
ADD deps.edn deps.edn
# Build uberjar
RUN clojure -Auberjar
# Slim final image without clojure build tools and without JDK
FROM openjdk:11-jre-slim
WORKDIR /usr/lib/crux
COPY --from=builder /usr/lib/crux/crux.jar /usr/lib/crux/crux.jar
ADD crux.edn crux.edn
# Limit RAM, enable JMX, run .jar
CMD [ \
  "java", \
  "-XX:+UseContainerSupport", \
  "-XX:+UnlockExperimentalVMOptions", \
  "-XX:+UseZGC", \
  "-Xmx4G", \
  "-XX:+HeapDumpOnOutOfMemoryError", \
  "-Dcom.sun.management.jmxremote=true", \
  "-Dcom.sun.management.jmxremote.local.only=false", \
  "-Dcom.sun.management.jmxremote.authenticate=false", \
  "-Dcom.sun.management.jmxremote.ssl=false", \
  "-Djava.rmi.server.hostname=localhost", \
  "-Dcom.sun.management.jmxremote.port=9010", \
  "-Dcom.sun.management.jmxremote.rmi.port=9010", \
  "-cp", \
  "crux.jar", \
  "clojure.main", \
  "-m", \
  "crux.main" \
]
