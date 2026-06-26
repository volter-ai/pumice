# Virtual FS

A tiny interface — `list / read / write / snapshot` plus a `capabilities` flag.

Because storage is behind this seam, the backing store can be anything: a local
folder via [[Adapters]], this Vite server, a git repo, Notion, or Google Drive.

See also [[Welcome]] and [[Two Modes]].
