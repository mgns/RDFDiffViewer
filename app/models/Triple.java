package models;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UnsupportedEncodingException;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

import play.Play;
import util.WindowsExplorerFileComparator;

/**
 * Represents a triple of property and object and diff information compared to predecessor version of DBpedia.
 * 
 * Offers static methods to get aggregated triples from file system
 * 
 * @author Martin
 *
 */
public class Triple {

    private static final File dataFolder = new File(Play.application().configuration().getString("dataFolder"));
    private static final List<String> versions = Play.application().configuration().getStringList("versions");

    public static enum State {
        deletion, insertion, unchanged
	}
	
	//property of triple in abbreviate version from raw data (e.g. skos:subject)
	public String property;
	//object of triple from raw data
	public String object;
	//property's fully resolved URI (e.g. http://www.w3.org/2009/08/skos-reference/skos.html#subject)
	public String propertyIRI;
	//object's fully resolved URI. Intended to be null in case of literal.
	public String objectIRI;
	//tells whether triple is new in the DBpedia version compared to predecessor version
	public State state;
	
	/**
	 * Returns all versions a DBpedia entity is present in
	 * @param entity	Name of the entity without prefix (e.g. "Vodafone")
	 * @return	Sorted list of version numbers
	 */
	public static List<String> getVersionsForEntity(String entity) {
		LinkedList<String> result = new LinkedList<String>();
		//for each version, represented as folder, look up if entity file is present
		for (String version : versions) {
            Path versionPath = Paths.get(dataFolder.getAbsolutePath(), version);

		    String entityFilePath = getFilePathForVersionPath(versionPath.toString(), entity);
		    File entityFile = new File(entityFilePath);
		    if (entityFile.exists())
		    	result.add(version);
		}
		return result;
	}
	
	/**
	 * Returns all triples from the file system for an entity with a specific version.
	 * Sets the states (new/unchanged) for existing triples and adds all triples from previous version that are not present
	 * any more with state "deletion"
	 * @param entity	
	 * @param version	version number
	 * @return	list of triples			
	 * @throws FileNotFoundException	cannot find the triples for that entity and version
	 * @throws IOException				
	 */
	public static List<Triple> getTriplesFromFileSystem(String entity, String version) throws FileNotFoundException, IOException {
		List<Triple> triples = getTriplesFromFileSystemWithoutState(entity, version);
		List<Triple> merged = new ArrayList<Triple>(triples);	//will contain all triples plus deletion triples from predecessor

        String previousVersion = getPreviousVersion(entity, version);
		//version 1.0 has no predecessor, no triples are compared
		if (previousVersion != null) {
			//check for new triples not contained in the predecessor
			List<Triple> previousTriples = getTriplesFromFileSystemWithoutState(entity, previousVersion);

			for (Triple triple : triples) {
				if (!previousTriples.contains(triple)) {
					triple.state = State.insertion;
				}
			}
			//check for triples that occur in the previous version but not in this version
			for (Triple previousTriple : previousTriples) {
				if (!triples.contains(previousTriple)) {
					previousTriple.state = State.deletion;
					//find the correct position to insert into merged
					ListIterator<Triple> it = merged.listIterator();
					while (it.hasNext() && !it.next().property.equals(previousTriple.property)) {}
					it.add(previousTriple);
				}
			}
		}
		return merged;
 	}
	
	//builds part of path between version folder and entity file (e.g. /dbr/VO/Vodafone)
	public static String getFilePathForVersionPath(String versionPath, String entity) {
		return  versionPath + "/dbr/"
	    		+ entity.substring(0, 2).toUpperCase()+"/"
	    		+ entity;
	}

	public Triple(String predicate, String predicateURI, String object, String objectURI, State state) {
		super();
		this.property = predicate;
		this.object = object;
		this.state = state;
		this.objectIRI = objectURI;
		this.propertyIRI = predicateURI;
	}

	//returns string of predecessor version of a certain entity, null for version 1.0
	private static String getPreviousVersion(String entity, String version) {
		List<String> versions = getVersionsForEntity(entity);
		int index = versions.indexOf(version);
		if (index <= 0)
			return null;
		return versions.get(index - 1);
	}

		
	//gets all triples from an entity in a specific version without setting the state attribute
	private static List<Triple> getTriplesFromFileSystemWithoutState(String entity, String version) throws UnsupportedEncodingException, FileNotFoundException, IOException {
		List<Triple> triples = new ArrayList<Triple>();
        Path versionPath = Paths.get(dataFolder.getAbsolutePath(), version);

        String filePath = getFilePathForVersionPath(versionPath.toString(), entity);
		File file = new File(filePath);
		try (BufferedReader reader = new BufferedReader(
				   new InputStreamReader(
		                      new FileInputStream(file), "UTF8"))){
			String line = null;
			while(null !=(line = reader.readLine())) {
				//property and object are separated at the first space
				int separator = line.indexOf(" ");
				String predicate = line.substring(0, separator);
				String predicateURI = resolveURI(predicate);
				String object = line.substring(separator+1);
				String objectURI = null;
				if(!object.startsWith("\"")) { //object is no literal but an URI
					objectURI = resolveURI(object);
				}
				Triple t = new Triple(predicate, predicateURI, object, objectURI, State.unchanged);
				triples.add(t);
			}
		}
		return triples;
	}

	//resolves the prefix and returns the full URI if possible
	private static String resolveURI(String predicate) throws UnsupportedEncodingException, FileNotFoundException, IOException {
		File prefixes = fileFromURL(Play.application().classloader().getResource("prefixes"));
		try (BufferedReader reader = new BufferedReader(
				   new InputStreamReader(
		                      new FileInputStream(prefixes), "UTF8"))) {
			String line = null;
			while((line = reader.readLine()) != null) {
				int separator = line.indexOf(":");
				String prefix = line.substring(0, separator).trim().replace("\"", "");
				String full = line.substring(separator+1).trim().replace("\"", "").replace(",", "");
				if(predicate.startsWith(prefix + ":")) {
					String result = predicate.replace(prefix + ":", full);
					return result;
				}
			}
			return null;
		}
	}
		
	//gets the File handler from a URL
	private static File fileFromURL(URL url) {
		File f;
		try {
		  f = new File(url.toURI());
		} catch(URISyntaxException e) {
		  f = new File(url.getPath());
		}
		return f;
	}

	@Override
	public int hashCode() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((object == null) ? 0 : object.hashCode());
		result = prime * result + ((property == null) ? 0 : property.hashCode());
		return result;
	}

	@Override
	public boolean equals(Object obj) {
		if (this == obj)
			return true;
		if (obj == null)
			return false;
		if (getClass() != obj.getClass())
			return false;
		Triple other = (Triple) obj;
		if (object == null) {
			if (other.object != null)
				return false;
		} else if (!object.equals(other.object))
			return false;
		if (property == null) {
			if (other.property != null)
				return false;
		} else if (!property.equals(other.property))
			return false;
		return true;
	}
	
	
	
}
